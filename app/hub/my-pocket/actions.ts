"use server";

import { revalidatePath } from "next/cache";
import { suggestCategory } from "@/lib/ai/categorize";
import { convert } from "@/lib/fx";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/lib/money";
import { isoDate, slugify, type PocketCategory } from "@/lib/pocket";
import { createClient } from "@/lib/supabase/server";
import { loadCategories, POCKET_PATH, pocketSession } from "./data";

const SETTINGS_PATH = `${POCKET_PATH}/ajustes`;
const CATEGORIES_PATH = `${POCKET_PATH}/categorias`;

export type FormState = { status: "idle" | "saved" | "error"; error?: string };

function refresh() {
  revalidatePath(POCKET_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(CATEGORIES_PATH);
}

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function pickCurrency(value: FormDataEntryValue | null, fallback: string) {
  const code = String(value ?? "");
  return CURRENCY_CODES.includes(code as (typeof CURRENCY_CODES)[number])
    ? code
    : fallback;
}

function toDay(value: FormDataEntryValue | null) {
  const day = toNumber(value);
  if (day == null) return null;
  const rounded = Math.round(day);
  return rounded >= 1 && rounded <= 31 ? rounded : null;
}

/**
 * Elige categoría con la IA cuando la persona no seleccionó ninguna.
 *
 * Solo ve las globales, y si inventa una la guarda global: el vocabulario
 * compartido crece con el uso de todos. Las personales quedan fuera.
 */
async function categorizeWithAi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "income" | "expense",
  description: string,
  amount: number,
  currency: string,
  categories: PocketCategory[]
): Promise<string | null> {
  const globals = categories.filter(
    (category) =>
      category.user_id === null &&
      (category.kind === kind || category.kind === "both")
  );

  const suggestion = await suggestCategory({
    description,
    amount,
    currency,
    kind,
    existing: globals.map((category) => category.name),
  });

  if (!suggestion) return null;

  const slug = slugify(suggestion.name);
  if (!slug) return null;

  const match = globals.find((category) => category.slug === slug);
  if (match) return match.id;

  const { data: created } = await supabase
    .from("pocket_categories")
    .insert({
      user_id: null,
      name: suggestion.name,
      slug,
      icon_key: suggestion.iconKey,
      kind,
      is_ai: true,
    })
    .select("id")
    .single();

  if (created?.id) return created.id as string;

  // Otra sesión la creó primero: la constraint única la rechazó, no la app.
  const { data: existing } = await supabase
    .from("pocket_categories")
    .select("id")
    .is("user_id", null)
    .eq("slug", slug)
    .eq("kind", kind)
    .maybeSingle();

  return (existing?.id as string | undefined) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Movimientos                                                                 */
/* -------------------------------------------------------------------------- */

export async function createTransaction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user, profile } = await pocketSession();

  if (!profile) {
    return { status: "error", error: "Configurá primero tu ingreso." };
  }

  const kind = formData.get("kind") === "income" ? "income" : "expense";
  const fixedId = toText(formData.get("fixed_expense_id"), 40);

  let description = toText(formData.get("description"), 120);
  let amount = toNumber(formData.get("amount"));
  let currency = pickCurrency(formData.get("currency"), profile.currency);
  let categoryId = toText(formData.get("category_id"), 40) || null;

  // Egreso fijo: la plantilla pone nombre, moneda y categoría; el monto se
  // puede pisar en el momento porque el recibo casi nunca llega igual.
  if (fixedId) {
    const { data: fixed } = await supabase
      .from("pocket_fixed_expenses")
      .select("name,amount,currency,category_id")
      .eq("id", fixedId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!fixed) return { status: "error", error: "Ese gasto fijo ya no existe." };

    description = description || String(fixed.name);
    amount = amount ?? Number(fixed.amount);
    currency = pickCurrency(formData.get("currency"), String(fixed.currency));
    categoryId = categoryId ?? (fixed.category_id as string | null);
  }

  if (description.length < 2) {
    return { status: "error", error: "Escribí de qué se trata." };
  }
  if (amount == null || amount <= 0) {
    return { status: "error", error: "Poné un monto mayor a cero." };
  }

  const occurredRaw = toText(formData.get("occurred_at"), 10);
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(occurredRaw)
    ? occurredRaw
    : isoDate(new Date());

  const categories = await loadCategories(supabase);

  // Una categoría que no existe o que es de otra persona no llega a la base.
  if (categoryId && !categories.some((category) => category.id === categoryId)) {
    categoryId = null;
  }

  let aiCategorized = false;

  if (!categoryId) {
    const suggested = await categorizeWithAi(
      supabase,
      kind,
      description,
      amount,
      currency,
      categories
    );
    if (suggested) {
      categoryId = suggested;
      aiCategorized = true;
    }
  }

  const converted = await convert(amount, currency, profile.currency);
  if (!converted) {
    return {
      status: "error",
      error: `No pudimos convertir de ${currency} a ${profile.currency}. Probá de nuevo.`,
    };
  }

  const { error } = await supabase.from("pocket_transactions").insert({
    user_id: user.id,
    kind,
    description,
    amount,
    currency,
    amount_base: Math.round(converted.amount * 100) / 100,
    base_currency: profile.currency,
    fx_rate: converted.rate,
    category_id: categoryId,
    fixed_expense_id: fixedId || null,
    source: fixedId ? "fixed" : "manual",
    ai_categorized: aiCategorized,
    occurred_at: occurredAt,
  });

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración de My Pocket?",
    };
  }

  refresh();
  return { status: "saved" };
}

export async function deleteTransaction(formData: FormData) {
  const id = toText(formData.get("id"), 40);
  if (!id) return;

  const { supabase, user } = await pocketSession();
  await supabase
    .from("pocket_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  refresh();
}

/** Recategorizar a mano: la última palabra siempre es de la persona. */
export async function setTransactionCategory(formData: FormData) {
  const id = toText(formData.get("id"), 40);
  const categoryId = toText(formData.get("category_id"), 40);
  if (!id || !categoryId) return;

  const { supabase, user } = await pocketSession();
  await supabase
    .from("pocket_transactions")
    .update({ category_id: categoryId, ai_categorized: false })
    .eq("id", id)
    .eq("user_id", user.id);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Fechas de pago                                                              */
/* -------------------------------------------------------------------------- */

export async function savePaySchedule(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user, profile } = await pocketSession();

  const id = toText(formData.get("id"), 40);
  const label = toText(formData.get("label"), 40) || "Pago";
  const day = toDay(formData.get("day_of_month"));
  const amount = toNumber(formData.get("amount"));
  const currency = pickCurrency(
    formData.get("currency"),
    profile?.currency ?? DEFAULT_CURRENCY
  );

  if (day == null) return { status: "error", error: "El día va del 1 al 31." };
  if (amount == null || amount <= 0) {
    return { status: "error", error: "Poné cuánto te pagan ese día." };
  }

  const payload = {
    user_id: user.id,
    label,
    day_of_month: day,
    amount,
    currency,
    active: true,
  };

  const { error } = id
    ? await supabase
        .from("pocket_pay_schedules")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("pocket_pay_schedules").insert(payload);

  if (error) {
    return { status: "error", error: "No se pudo guardar la fecha de pago." };
  }

  refresh();
  return { status: "saved" };
}

export async function deletePaySchedule(formData: FormData) {
  const id = toText(formData.get("id"), 40);
  if (!id) return;

  const { supabase, user } = await pocketSession();

  // Los movimientos no se tocan: borrar la fecha borra el recordatorio,
  // nunca el historial. Eso lo decide la persona, movimiento por movimiento.
  await supabase
    .from("pocket_pay_schedules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Gastos fijos                                                                */
/* -------------------------------------------------------------------------- */

export async function saveFixedExpense(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user, profile } = await pocketSession();

  const id = toText(formData.get("id"), 40);
  const name = toText(formData.get("name"), 60);
  const amount = toNumber(formData.get("amount"));
  const currency = pickCurrency(
    formData.get("currency"),
    profile?.currency ?? DEFAULT_CURRENCY
  );
  const day = toDay(formData.get("day_of_month"));
  const categoryId = toText(formData.get("category_id"), 40) || null;

  if (name.length < 2) return { status: "error", error: "Ponele nombre." };
  if (amount == null || amount <= 0) {
    return { status: "error", error: "Poné cuánto se paga." };
  }

  const payload = {
    user_id: user.id,
    name,
    amount,
    currency,
    day_of_month: day,
    category_id: categoryId,
    active: true,
  };

  const { error } = id
    ? await supabase
        .from("pocket_fixed_expenses")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("pocket_fixed_expenses").insert(payload);

  if (error) {
    return { status: "error", error: "No se pudo guardar el gasto fijo." };
  }

  refresh();
  return { status: "saved" };
}

export async function deleteFixedExpense(formData: FormData) {
  const id = toText(formData.get("id"), 40);
  if (!id) return;

  const { supabase, user } = await pocketSession();
  await supabase
    .from("pocket_fixed_expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Categorías personales                                                       */
/* -------------------------------------------------------------------------- */

export async function createCategory(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await pocketSession();

  const name = toText(formData.get("name"), 40);
  const iconKey = toText(formData.get("icon_key"), 24) || "other";
  const kind = formData.get("kind") === "income" ? "income" : "expense";

  if (name.length < 2) {
    return { status: "error", error: "Ponele nombre a la categoría." };
  }

  const slug = slugify(name);
  if (!slug) return { status: "error", error: "Ese nombre no sirve como categoría." };

  const { error } = await supabase.from("pocket_categories").insert({
    user_id: user.id,
    name,
    slug,
    icon_key: iconKey,
    kind,
    is_ai: false,
  });

  if (error) {
    return { status: "error", error: "Ya tenés una categoría con ese nombre." };
  }

  refresh();
  return { status: "saved" };
}

export async function deleteCategory(formData: FormData) {
  const id = toText(formData.get("id"), 40);
  if (!id) return;

  const { supabase, user } = await pocketSession();

  // Solo las propias: las globales son de todos y la política las protege.
  await supabase
    .from("pocket_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  refresh();
}
