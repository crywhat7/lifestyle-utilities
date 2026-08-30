"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scanExpenses } from "@/lib/ai/scan";
import { convert } from "@/lib/fx";
import { CURRENCY_CODES } from "@/lib/money";
import { isoDate, slugify, type PocketCategory } from "@/lib/pocket";
import {
  dedupeBatch,
  findDuplicate,
  normalizeRef,
  DUPLICATE_WINDOW_DAYS,
  type ExistingExpense,
  type ScannedExpense,
} from "@/lib/pocket-scan";
import { ensureGlobalCategory, globalCategories } from "../categories";
import { loadCategories, POCKET_PATH, pocketSession } from "../data";

/** Lo que aguanta el recorte que manda el navegador, ya comprimido. */
const MAX_BYTES = 4_500_000;
const MAX_ROWS = 40;
/** Un egreso más grande que esto es un error de lectura, no un gasto. */
const MAX_AMOUNT = 10_000_000;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ScanState =
  | { status: "idle" }
  | { status: "ready"; expenses: ScannedExpense[] }
  | { status: "error"; error: string };

export type ImportState =
  | { status: "idle" }
  | { status: "error"; error: string };

function refresh() {
  revalidatePath(POCKET_PATH);
  revalidatePath(`${POCKET_PATH}/movimiento/[id]`, "page");
}

function pickCurrency(code: string, fallback: string) {
  return CURRENCY_CODES.includes(code as (typeof CURRENCY_CODES)[number])
    ? code
    : fallback;
}

/**
 * Una fecha leída de la captura nunca puede caer adelante de hoy.
 *
 * El año es lo que más se equivoca: la captura casi nunca lo muestra y el
 * modelo lo completa. Antes de rendirse y usar hoy se prueba el año anterior,
 * que es lo que casi siempre quiso decir un 27/08 leído en diciembre.
 */
function pickDate(value: string | null, today: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  if (value <= today) {
    // Más de dos años atrás es un año mal leído, no un gasto viejo.
    const floor = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
    return value < floor ? today : value;
  }

  const back = `${Number(value.slice(0, 4)) - 1}${value.slice(4)}`;
  return back <= today ? back : today;
}

function matchCategory(
  name: string,
  globals: PocketCategory[]
): PocketCategory | null {
  const slug = slugify(name);
  if (!slug) return null;
  return globals.find((category) => category.slug === slug) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Leer la captura                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Lee la imagen y devuelve los egresos que encontró, ya contrastados contra
 * lo que la persona tiene guardado.
 *
 * Nada se inserta acá: esto solo propone. La imagen tampoco se guarda — se
 * lee, se extrae y se descarta, porque un estado de cuenta en un bucket es
 * una responsabilidad que esta app no necesita cargar.
 */
export async function scanImage(
  _prev: ScanState,
  formData: FormData
): Promise<ScanState> {
  const { supabase, user, profile } = await pocketSession();

  if (!profile) {
    return { status: "error", error: "Configurá primero tu ingreso." };
  }

  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", error: "Adjuntá una captura primero." };
  }
  if (!MIME_TYPES.includes(file.type)) {
    return { status: "error", error: "Solo imágenes: JPG, PNG o WebP." };
  }
  if (file.size > MAX_BYTES) {
    return { status: "error", error: "La imagen pesa demasiado. Recortala más." };
  }

  const today = isoDate(new Date());
  const categories = await loadCategories(supabase);
  const globals = globalCategories(categories, "expense");

  const result = await scanExpenses({
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mimeType: file.type,
    existing: globals.map((category) => category.name),
    baseCurrency: profile.currency,
    today,
  });

  if (!result.ok) {
    if (result.kind === "empty") {
      return {
        status: "error",
        error:
          "No se ven egresos en ese recorte. Probá dejando las filas completas.",
      };
    }
    if (result.kind === "no_key") {
      return { status: "error", error: "La lectura con IA no está configurada." };
    }
    return {
      status: "error",
      error: "No se pudo leer la imagen. Probá de nuevo en un momento.",
    };
  }

  const rows = dedupeBatch(
    result.movements
      .filter((movement) => movement.amount <= MAX_AMOUNT)
      .map((movement) => ({
        ...movement,
        currency: pickCurrency(movement.currency, profile.currency),
        occurred_at: pickDate(movement.date, today),
      }))
  ).slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return {
      status: "error",
      error: "No se ven egresos en ese recorte. Probá dejando las filas completas.",
    };
  }

  const existing = await loadNearbyExpenses(supabase, user.id, rows);

  const expenses: ScannedExpense[] = rows.map((row, index) => {
    const category = matchCategory(row.category, globals);

    return {
      key: `r${index}`,
      description: row.description,
      amount: Math.round(row.amount * 100) / 100,
      currency: row.currency,
      occurred_at: row.occurred_at,
      status: row.status,
      reference: normalizeRef(row.reference) ? row.reference : null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? row.category,
      iconKey: category?.icon_key ?? row.iconKey,
      duplicate: findDuplicate(
        {
          amount: row.amount,
          currency: row.currency,
          occurred_at: row.occurred_at,
          reference: row.reference,
        },
        existing
      ),
    };
  });

  return { status: "ready", expenses };
}

/**
 * Los movimientos guardados que podrían ser estos mismos: la ventana de la
 * captura estirada por los días que tolera la regla de duplicados. Traer el
 * histórico entero para comparar diez filas sería tirar plata en red.
 */
async function loadNearbyExpenses(
  supabase: Awaited<ReturnType<typeof pocketSession>>["supabase"],
  userId: string,
  rows: { occurred_at: string }[]
): Promise<ExistingExpense[]> {
  const dates = rows.map((row) => row.occurred_at).sort();
  const shift = (iso: string, days: number) =>
    isoDate(new Date(Date.parse(`${iso}T12:00:00`) + days * 86_400_000));

  const { data } = await supabase
    .from("pocket_transactions")
    .select("description,amount,currency,occurred_at,external_ref")
    .eq("user_id", userId)
    .eq("kind", "expense")
    .gte("occurred_at", shift(dates[0], -DUPLICATE_WINDOW_DAYS))
    .lte("occurred_at", shift(dates[dates.length - 1], DUPLICATE_WINDOW_DAYS))
    .limit(500);

  return (data ?? []).map((row) => ({
    description: String(row.description),
    amount: Number(row.amount),
    currency: String(row.currency),
    occurred_at: String(row.occurred_at),
    external_ref: (row.external_ref as string | null) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Guardar lo confirmado                                                       */
/* -------------------------------------------------------------------------- */

type Payload = {
  description: string;
  amount: number;
  currency: string;
  occurred_at: string;
  status: "posted" | "pending";
  reference: string | null;
  categoryId: string | null;
  categoryName: string;
  iconKey: string;
};

function parsePayload(raw: FormDataEntryValue | null): Payload[] {
  if (typeof raw !== "string") return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, MAX_ROWS)
      .map((row): Payload | null => {
        const amount = Number(row?.amount);
        const description = String(row?.description ?? "")
          .trim()
          .slice(0, 120);

        if (description.length < 2) return null;
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
          return null;
        }

        const date = String(row?.occurred_at ?? "").slice(0, 10);

        return {
          description,
          amount: Math.round(amount * 100) / 100,
          currency: String(row?.currency ?? ""),
          occurred_at: /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? date
            : isoDate(new Date()),
          status: row?.status === "pending" ? "pending" : "posted",
          reference: normalizeRef(row?.reference),
          categoryId:
            typeof row?.categoryId === "string" && row.categoryId
              ? row.categoryId.slice(0, 40)
              : null,
          categoryName: String(row?.categoryName ?? "")
            .trim()
            .slice(0, 40),
          iconKey: String(row?.iconKey ?? "other").slice(0, 24),
        };
      })
      .filter((row): row is Payload => row !== null);
  } catch {
    return [];
  }
}

/**
 * Inserta los egresos que la persona dejó marcados.
 *
 * La referencia del banco tiene índice único por persona: si dos capturas se
 * pisan, la base rechaza la repetida y acá se cuenta como omitida en vez de
 * romper toda la tanda. Ese es el único duplicado que se bloquea solo — el de
 * "mismo monto" se avisa al revisar y lo decide quien está mirando.
 */
export async function importScanned(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const { supabase, user, profile } = await pocketSession();

  if (!profile) {
    return { status: "error", error: "Configurá primero tu ingreso." };
  }

  const rows = parsePayload(formData.get("rows"));

  if (rows.length === 0) {
    return { status: "error", error: "No quedó ningún egreso seleccionado." };
  }

  const categories = await loadCategories(supabase);
  const globals = globalCategories(categories, "expense");
  const own = new Set(
    categories
      .filter((category) => category.user_id === null || category.user_id === user.id)
      .map((category) => category.id)
  );

  // Una tasa por moneda, no una por fila: son todas del mismo día.
  const rates = new Map<string, { amount: number; rate: number } | null>();
  const resolved = new Map<string, string | null>();

  let saved = 0;

  for (const row of rows) {
    const currency = pickCurrency(row.currency, profile.currency);

    if (!rates.has(currency)) {
      rates.set(currency, await convert(1, currency, profile.currency));
    }
    const rate = rates.get(currency);
    if (!rate) continue;

    let categoryId = row.categoryId && own.has(row.categoryId) ? row.categoryId : null;
    let aiCategorized = false;

    // La categoría que propuso la IA todavía no existe: se crea global, una
    // sola vez por nombre aunque venga en cinco filas de la misma captura.
    if (!categoryId && row.categoryName) {
      if (!resolved.has(row.categoryName)) {
        resolved.set(
          row.categoryName,
          await ensureGlobalCategory(
            supabase,
            "expense",
            row.categoryName,
            row.iconKey,
            globals
          )
        );
      }
      categoryId = resolved.get(row.categoryName) ?? null;
      aiCategorized = Boolean(categoryId);
    } else if (categoryId) {
      aiCategorized = true;
    }

    const { error } = await supabase.from("pocket_transactions").insert({
      user_id: user.id,
      kind: "expense",
      description: row.description,
      amount: row.amount,
      currency,
      amount_base: Math.round(row.amount * rate.rate * 100) / 100,
      base_currency: profile.currency,
      fx_rate: rate.rate,
      category_id: categoryId,
      source: "image",
      status: row.status,
      external_ref: row.reference,
      ai_categorized: aiCategorized,
      occurred_at: row.occurred_at,
    });

    // 23505 = esa referencia ya estaba registrada. No es un fallo: es la
    // defensa contra el duplicado haciendo exactamente su trabajo.
    if (!error) saved += 1;
    else if (error.code !== "23505") {
      return {
        status: "error",
        error: "No se pudo guardar. ¿Corriste la migración 0005?",
      };
    }
  }

  if (saved === 0) {
    return {
      status: "error",
      error: "Todos esos egresos ya estaban registrados.",
    };
  }

  refresh();
  redirect(POCKET_PATH);
}
