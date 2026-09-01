import "server-only";
import { redirect } from "next/navigation";
import { hourlyRate, type WorkProfile } from "@/lib/money";
import {
  isPendingLabel,
  isoDate,
  normalizePhrase,
  type FixedExpense,
  type PaySchedule,
  type PocketCategory,
  type PocketTransaction,
} from "@/lib/pocket";
import { currentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const POCKET_PATH = "/hub/my-pocket";

export type PocketSession = Awaited<ReturnType<typeof pocketSession>>;

/**
 * El cliente y la persona, sin salir a la red.
 *
 * La sesión ya la verificó el proxy en esta misma petición, así que esto no
 * espera a nadie: sirve para arrancar todas las consultas de una pantalla en
 * paralelo en vez de encadenarlas detrás del perfil.
 */
export async function pocketClient() {
  const user = await currentUser();
  if (!user) redirect("/");

  return { supabase: await createClient("lifestyle_utilities"), user };
}

/** El cliente, la persona y su perfil de trabajo, en una sola llamada. */
export async function pocketSession() {
  const { supabase, user } = await pocketClient();
  const profile = await loadPocketProfile(supabase, user.id);

  return { supabase, user, ...profile };
}

export type PocketProfile = Awaited<ReturnType<typeof loadPocketProfile>>;

export async function loadPocketProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const COLUMNS = "monthly_income,hours_per_day,days_per_week,currency,hourly_rate,created_at";

  // `pocket_since` llegó en la migración 0004. Si todavía no se corrió, la
  // consulta falla entera y la persona vería el onboarding como si no tuviera
  // perfil — así que se reintenta sin esa columna en vez de romper la app.
  type ProfileRow = {
    monthly_income: number;
    hours_per_day: number;
    days_per_week: number;
    currency: string;
    hourly_rate: number;
    created_at?: string;
    pocket_since?: string | null;
  };

  const full = await supabase
    .from("work_profiles")
    .select(`${COLUMNS},pocket_since`)
    .eq("user_id", userId)
    .maybeSingle();

  let data = full.data as ProfileRow | null;

  if (!data) {
    const fallback = await supabase
      .from("work_profiles")
      .select(COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    data = fallback.data as ProfileRow | null;
  }

  let profile: WorkProfile | null = null;

  if (data) {
    profile = {
      monthly_income: Number(data.monthly_income),
      hours_per_day: Number(data.hours_per_day),
      days_per_week: Number(data.days_per_week),
      currency: String(data.currency),
      hourly_rate: Number(data.hourly_rate) || 0,
    };
    profile.hourly_rate = profile.hourly_rate || hourlyRate(profile);
  }

  return {
    profile,
    /** Desde cuándo cuentan los fijos. Ver `TrackingSince` en los ajustes. */
    since: trackingSince(data?.pocket_since, data?.created_at),
    /** El arranque real de la cuenta, para explicar de dónde sale el default. */
    accountSince: isoDay(data?.created_at) ?? isoDate(new Date()),
    /** Si la fecha está puesta a mano o heredada del perfil. */
    sinceIsCustom: Boolean(data?.pocket_since),
  };
}

/** Fecha configurada, o el día en que nació el perfil, o hoy. */
function trackingSince(custom?: string | null, createdAt?: string) {
  return isoDay(custom) ?? isoDay(createdAt) ?? isoDate(new Date());
}

/** Recorta un `date` o un `timestamptz` de Postgres a YYYY-MM-DD. */
function isoDay(value?: string | null) {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export async function loadCategories(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PocketCategory[]> {
  const { data } = await supabase
    .from("pocket_categories")
    .select("id,user_id,name,slug,icon_key,kind,is_ai")
    .order("user_id", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  return (data ?? []) as PocketCategory[];
}

/**
 * Las columnas de la regla llegaron en la migración 0006. Si todavía no se
 * corrió, la consulta entera falla y la persona vería la app vacía en vez de
 * un error — así que se reintenta sin ellas y todo se comporta como antes:
 * día del mes y monto exacto.
 */
const RULE_COLUMNS = "freq,weekday,week_ordinal";

function withDefaultRule<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    freq: (row.freq as string | undefined) ?? "monthly_day",
    weekday: (row.weekday as number | null | undefined) ?? null,
    week_ordinal: (row.week_ordinal as number | null | undefined) ?? null,
  };
}

export async function loadPaySchedules(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PaySchedule[]> {
  const BASE = "id,label,day_of_month,amount,currency,active";

  const full = await supabase
    .from("pocket_pay_schedules")
    .select(`${BASE},${RULE_COLUMNS}`)
    .eq("user_id", userId);

  const { data } = full.error
    ? await supabase
        .from("pocket_pay_schedules")
        .select(BASE)
        .eq("user_id", userId)
    : full;

  return (data ?? [])
    .map((row) => ({
      ...withDefaultRule(row as Record<string, unknown>),
      amount: Number((row as { amount: number }).amount),
    }))
    .sort(sortByRule) as PaySchedule[];
}

/** Primero lo semanal, después lo mensual; dentro de cada cosa, por día. */
function sortByRule(
  a: Record<string, unknown>,
  b: Record<string, unknown>
) {
  const rank = (row: Record<string, unknown>) =>
    row.freq === "weekly" ? 0 : row.freq === "monthly_weekday" ? 1 : 2;

  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;

  const key = (row: Record<string, unknown>) =>
    (row.weekday as number | null) ?? (row.day_of_month as number | null) ?? 99;

  return key(a) - key(b);
}

export async function loadFixedExpenses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<FixedExpense[]> {
  const BASE = "id,name,amount,currency,day_of_month,category_id,active";

  const full = await supabase
    .from("pocket_fixed_expenses")
    .select(`${BASE},amount_max,${RULE_COLUMNS}`)
    .eq("user_id", userId);

  const { data } = full.error
    ? await supabase
        .from("pocket_fixed_expenses")
        .select(BASE)
        .eq("user_id", userId)
    : full;

  return (data ?? [])
    .map((row) => {
      const max = (row as { amount_max?: number | null }).amount_max;
      return {
        ...withDefaultRule(row as Record<string, unknown>),
        amount: Number((row as { amount: number }).amount),
        amount_max: max == null ? null : Number(max),
      };
    })
    .sort(sortByRule) as FixedExpense[];
}

/**
 * La última vez que se registró cada gasto contemplado.
 *
 * Antes bastaba con "¿ya se pagó este mes?", pero un gasto de todos los
 * sábados tiene cuatro vencimientos en el mismo mes: lo que importa no es el
 * calendario sino la fecha del último registro, que la agenda compara contra
 * el vencimiento vigente. Se miran diez semanas hacia atrás — más allá, todo
 * está vencido igual.
 */
export async function loadFixedPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Map<string, string>> {
  const floor = isoDate(new Date(Date.now() - 70 * 86_400_000));

  const { data } = await supabase
    .from("pocket_transactions")
    .select("fixed_expense_id,occurred_at")
    .eq("user_id", userId)
    .eq("source", "fixed")
    .gte("occurred_at", floor)
    .not("fixed_expense_id", "is", null)
    .order("occurred_at", { ascending: false });

  const latest = new Map<string, string>();

  for (const row of data ?? []) {
    const id = row.fixed_expense_id as string | null;
    if (!id || latest.has(id)) continue;
    latest.set(id, String(row.occurred_at));
  }

  return latest;
}

export type LedgerRow = Pick<
  PocketTransaction,
  "kind" | "amount_base" | "occurred_at" | "category_id"
>;

/** Todo el histórico reducido a lo mínimo para sumar: balance y agregados. */
export async function loadLedger(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<LedgerRow[]> {
  const { data } = await supabase
    .from("pocket_transactions")
    .select("kind,amount_base,occurred_at,category_id")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  return (data ?? []).map((row) => ({
    ...row,
    amount_base: Number(row.amount_base),
  })) as LedgerRow[];
}

export async function loadTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  limit = 40
): Promise<PocketTransaction[]> {
  const { data } = await supabase
    .from("pocket_transactions")
    .select(
      "id,kind,description,amount,currency,amount_base,base_currency,fx_rate,category_id,source,ai_categorized,occurred_at,created_at"
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    amount_base: Number(row.amount_base),
    fx_rate: Number(row.fx_rate),
  })) as PocketTransaction[];
}

/**
 * Los egresos de una categoría, para abrirla desde el reparto.
 *
 * `categoryId` en `null` es la bolsa de los que no tienen ninguna: en la base
 * eso es un `IS NULL`, no un `=`. El rango llega abierto por la derecha, así
 * que el día 1 del mes siguiente queda afuera y no hay que saber cuántos días
 * tiene el mes.
 */
export async function loadCategoryTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string | null,
  range: { from: string; to: string } | null,
  limit = 200
): Promise<PocketTransaction[]> {
  let query = supabase
    .from("pocket_transactions")
    .select(
      "id,kind,description,amount,currency,amount_base,base_currency,fx_rate,category_id,source,ai_categorized,occurred_at,created_at"
    )
    .eq("user_id", userId)
    .eq("kind", "expense");

  query = categoryId
    ? query.eq("category_id", categoryId)
    : query.is("category_id", null);

  if (range) {
    query = query.gte("occurred_at", range.from).lt("occurred_at", range.to);
  }

  const { data } = await query
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    amount_base: Number(row.amount_base),
    fx_rate: Number(row.fx_rate),
  })) as PocketTransaction[];
}

/** Un solo movimiento — para su pantalla de detalle. */
export async function loadTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  id: string
): Promise<PocketTransaction | null> {
  const { data } = await supabase
    .from("pocket_transactions")
    .select(
      "id,kind,description,amount,currency,amount_base,base_currency,fx_rate,category_id,source,ai_categorized,occurred_at,created_at"
    )
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  return {
    ...data,
    amount: Number(data.amount),
    amount_base: Number(data.amount_base),
    fx_rate: Number(data.fx_rate),
  } as PocketTransaction;
}

/* -------------------------------------------------------------------------- */
/* Pendientes de clasificar                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Las frases con las que el banco nombra lo que todavía no liquidó.
 *
 * La tabla se mantiene a mano desde Supabase; acá solo se lee y se normaliza
 * una vez por pantalla. Si la migración 0007 todavía no se corrió, la
 * consulta falla y la lista queda vacía: nadie ve puntos y nada se rompe.
 */
export async function loadPendingPhrases(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const { data, error } = await supabase
    .from("pocket_pending_phrases")
    .select("phrase")
    .eq("active", true);

  if (error) return [];

  return (data ?? [])
    .map((row) => normalizePhrase(String(row.phrase)))
    .filter((phrase) => phrase.length > 1);
}

/**
 * Todo lo que sigue con nombre provisional.
 *
 * La base hace el descarte grueso con un `ilike` por frase y la comparación
 * fina la hace `isPendingLabel`, que sí entiende de tildes. Traer el
 * histórico entero para filtrarlo en memoria sería tirar plata en red, y
 * pedirle a Postgres que ignore tildes exigiría una extensión que esta app
 * no necesita instalar.
 *
 * Las frases con coma o paréntesis se saltan: son los separadores del `or`
 * de PostgREST y romperían la consulta entera.
 */
export async function loadPendingTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  phrases: string[],
  limit = 60
): Promise<PocketTransaction[]> {
  const safe = phrases.filter((phrase) => !/[,()]/.test(phrase));
  if (safe.length === 0) return [];

  const { data } = await supabase
    .from("pocket_transactions")
    .select(
      "id,kind,description,amount,currency,amount_base,base_currency,fx_rate,category_id,source,ai_categorized,occurred_at,created_at"
    )
    .eq("user_id", userId)
    .or(safe.map((phrase) => `description.ilike.%${phrase}%`).join(","))
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? [])
    .map((row) => ({
      ...row,
      amount: Number(row.amount),
      amount_base: Number(row.amount_base),
      fx_rate: Number(row.fx_rate),
    }))
    .filter((row) =>
      isPendingLabel(String(row.description), phrases)
    ) as PocketTransaction[];
}
