"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestCategory } from "@/lib/ai/categorize";
import { convert } from "@/lib/fx";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "@/lib/money";
import {
  isoDate,
  slugify,
  type Freq,
  type PocketCategory,
  type Recurrence,
} from "@/lib/pocket";
import { createClient } from "@/lib/supabase/server";
import { ensureGlobalCategory, globalCategories } from "./categories";
import { loadCategories, POCKET_PATH, pocketSession } from "./data";

const SETTINGS_PATH = `${POCKET_PATH}/ajustes`;
const CATEGORIES_PATH = `${POCKET_PATH}/categorias`;
const PENDING_PATH = `${POCKET_PATH}/pendientes`;

export type FormState = { status: "idle" | "saved" | "error"; error?: string };

function refresh() {
  revalidatePath(POCKET_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(CATEGORIES_PATH);
  revalidatePath(`${POCKET_PATH}/movimiento/[id]`, "page");
  revalidatePath(PENDING_PATH);
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
 * Lee la regla de recurrencia del formulario y la deja consistente.
 *
 * Lo que la frecuencia elegida no usa se guarda en nulo a propósito: un pago
 * semanal que arrastre el día 15 de cuando era mensual es una bomba de tiempo
 * el día que alguien lea esa columna sin mirar `freq`.
 */
function toRule(formData: FormData): Recurrence | { error: string } {
  const raw = String(formData.get("freq") ?? "monthly_day");
  const freq: Freq =
    raw === "weekly" || raw === "monthly_weekday" ? raw : "monthly_day";

  if (freq === "monthly_day") {
    return {
      freq,
      day_of_month: toDay(formData.get("day_of_month")),
      weekday: null,
      week_ordinal: null,
    };
  }

  const weekday = toNumber(formData.get("weekday"));
  if (weekday == null || weekday < 0 || weekday > 6) {
    return { error: "Elegí el día de la semana." };
  }

  if (freq === "weekly") {
    return {
      freq,
      day_of_month: null,
      weekday: Math.round(weekday),
      week_ordinal: null,
    };
  }

  const ordinal = toNumber(formData.get("week_ordinal"));
  if (ordinal == null || ![1, 2, 3, 4, -1, -2].includes(Math.round(ordinal))) {
    return { error: "Elegí qué semana del mes." };
  }

  return {
    freq,
    day_of_month: null,
    weekday: Math.round(weekday),
    week_ordinal: Math.round(ordinal),
  };
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
  const globals = globalCategories(categories, kind);

  const suggestion = await suggestCategory({
    description,
    amount,
    currency,
    kind,
    existing: globals.map((category) => category.name),
  });

  if (!suggestion) return null;

  return ensureGlobalCategory(
    supabase,
    kind,
    suggestion.name,
    suggestion.iconKey,
    globals
  );
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
  const fixedId = kind === "expense" ? toText(formData.get("fixed_expense_id"), 40) : "";
  const payId = kind === "income" ? toText(formData.get("pay_schedule_id"), 40) : "";

  let description = toText(formData.get("description"), 120);
  let amount = toNumber(formData.get("amount"));
  let currency = pickCurrency(formData.get("currency"), profile.currency);
  let categoryId = toText(formData.get("category_id"), 40) || null;

  // Salario: la fecha de pago es la plantilla del ingreso. Igual que el gasto
  // fijo, el monto se puede pisar porque el depósito nunca cae exacto.
  if (payId) {
    const { data: schedule } = await supabase
      .from("pocket_pay_schedules")
      .select("label,amount,currency")
      .eq("id", payId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!schedule) {
      return { status: "error", error: "Esa fecha de pago ya no existe." };
    }

    description = description || String(schedule.label);
    amount = amount ?? Number(schedule.amount);
    currency = pickCurrency(formData.get("currency"), String(schedule.currency));
  }

  // Egreso fijo: la plantilla pone nombre, moneda y categoría; el monto se
  // puede pisar en el momento porque el recibo casi nunca llega igual.
  if (fixedId) {
    const { data: fixed } = await supabase
      .from("pocket_fixed_expenses")
      .select("name,amount,currency,category_id")
      .eq("id", fixedId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!fixed) return { status: "error", error: "Ese gasto contemplado ya no existe." };

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
    pay_schedule_id: payId || null,
    fixed_expense_id: fixedId || null,
    source: payId ? "salary" : fixedId ? "fixed" : "manual",
    ai_categorized: aiCategorized,
    occurred_at: occurredAt,
  });

  if (error) {
    // La constraint (pay_schedule_id, occurred_at) impide cobrar dos veces
    // el mismo día de pago: eso no es un fallo, es la regla haciendo su trabajo.
    if (error.code === "23505") {
      return {
        status: "error",
        error: "Ese pago ya estaba registrado en esa fecha.",
      };
    }
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración de My Pocket?",
    };
  }

  refresh();
  // El registro vive en su propia pantalla: al guardar se vuelve al balance.
  redirect(POCKET_PATH);
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
  redirect(POCKET_PATH);
}

/**
 * Recategorizar a mano: la última palabra siempre es de la persona.
 *
 * No redirige: se vuelve a dibujar la misma pantalla con la categoría puesta.
 * Un movimiento que entró como "COMPRA EN PROCESO" se arregla en dos pasos
 * —nombre y categoría— y mandar de vuelta al balance en el primero obligaba
 * a volver a buscarlo para el segundo.
 */
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
  revalidatePath(PENDING_PATH);
}

/**
 * Ponerle el nombre de verdad.
 *
 * Es la otra mitad de clasificar una compra retenida: el banco la registró
 * como "COMPRA EN PROCESO" y días después uno sabe que era el súper. Se
 * queda en la misma pantalla, que es donde está la cuadrícula de categorías.
 */
export async function renameTransaction(formData: FormData) {
  const id = toText(formData.get("id"), 40);
  const description = toText(formData.get("description"), 120);

  if (!id || description.length < 2) return;

  const { supabase, user } = await pocketSession();

  await supabase
    .from("pocket_transactions")
    .update({ description })
    .eq("id", id)
    .eq("user_id", user.id);

  refresh();
  revalidatePath(PENDING_PATH);
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
  const amount = toNumber(formData.get("amount"));
  const currency = pickCurrency(
    formData.get("currency"),
    profile?.currency ?? DEFAULT_CURRENCY
  );

  const rule = toRule(formData);
  if ("error" in rule) return { status: "error", error: rule.error };

  // Un pago tiene que caer algún día: sin fecha no hay nada que anunciar ni
  // que registrar solo. El gasto contemplado sí se permite no tenerla.
  if (rule.freq === "monthly_day" && rule.day_of_month == null) {
    return { status: "error", error: "El día va del 1 al 31." };
  }
  if (amount == null || amount <= 0) {
    return { status: "error", error: "Poné cuánto te pagan ese día." };
  }

  const payload = {
    user_id: user.id,
    label,
    amount,
    currency,
    active: true,
    ...rule,
  };

  const { error } = id
    ? await supabase
        .from("pocket_pay_schedules")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("pocket_pay_schedules").insert(payload);

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0006?",
    };
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
/* Desde cuándo cuenta el seguimiento                                          */
/* -------------------------------------------------------------------------- */

/**
 * Mueve (o borra) la frontera del seguimiento de gastos contemplados.
 *
 * Vacío devuelve la columna a nulo, que significa "usá la fecha en que nació
 * el perfil". Adelante en el tiempo no se acepta: una frontera futura dejaría
 * todos los fijos fuera de alcance para siempre.
 */
export async function savePocketSince(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await pocketSession();

  const raw = toText(formData.get("pocket_since"), 10);
  let value: string | null = null;

  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { status: "error", error: "Esa fecha no se entiende." };
    }
    if (raw > isoDate(new Date())) {
      return { status: "error", error: "No puede ser una fecha futura." };
    }
    value = raw;
  }

  const { error } = await supabase
    .from("work_profiles")
    .update({ pocket_since: value })
    .eq("user_id", user.id);

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0004?",
    };
  }

  refresh();
  return { status: "saved" };
}

/* -------------------------------------------------------------------------- */
/* Gastos contemplados                                                          */
/* -------------------------------------------------------------------------- */

export async function saveFixedExpense(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user, profile } = await pocketSession();

  const id = toText(formData.get("id"), 40);
  const name = toText(formData.get("name"), 60);
  const amount = toNumber(formData.get("amount"));
  const amountMax = toNumber(formData.get("amount_max"));
  const currency = pickCurrency(
    formData.get("currency"),
    profile?.currency ?? DEFAULT_CURRENCY
  );
  const categoryId = toText(formData.get("category_id"), 40) || null;

  const rule = toRule(formData);
  if ("error" in rule) return { status: "error", error: rule.error };

  if (name.length < 2) return { status: "error", error: "Ponele nombre." };
  if (amount == null || amount <= 0) {
    return { status: "error", error: "Poné cuánto se paga." };
  }

  // El rango es opcional, pero al revés no existe: un techo por debajo del
  // piso solo puede ser un error de tipeo.
  if (amountMax != null && amountMax < amount) {
    return {
      status: "error",
      error: "El máximo no puede ser menor que el mínimo.",
    };
  }

  const payload = {
    user_id: user.id,
    name,
    amount,
    amount_max: amountMax != null && amountMax > amount ? amountMax : null,
    currency,
    category_id: categoryId,
    active: true,
    ...rule,
  };

  const { error } = id
    ? await supabase
        .from("pocket_fixed_expenses")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("pocket_fixed_expenses").insert(payload);

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0006?",
    };
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
