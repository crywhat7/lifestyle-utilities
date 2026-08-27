import "server-only";
import { redirect } from "next/navigation";
import { convert } from "@/lib/fx";
import { hourlyRate, type WorkProfile } from "@/lib/money";
import {
  clampDay,
  isoDate,
  type FixedExpense,
  type PaySchedule,
  type PocketCategory,
  type PocketTransaction,
} from "@/lib/pocket";
import { createClient } from "@/lib/supabase/server";

export const POCKET_PATH = "/hub/my-pocket";

/** Cuántos meses hacia atrás se materializan los pagos al abrir la app. */
const BACKFILL_MONTHS = 3;

export type PocketSession = Awaited<ReturnType<typeof pocketSession>>;

export async function pocketSession() {
  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data } = await supabase
    .from("work_profiles")
    .select("monthly_income,hours_per_day,days_per_week,currency,hourly_rate")
    .eq("user_id", user.id)
    .maybeSingle();

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

  return { supabase, user, profile };
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

export async function loadPaySchedules(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PaySchedule[]> {
  const { data } = await supabase
    .from("pocket_pay_schedules")
    .select("id,label,day_of_month,amount,currency,active")
    .eq("user_id", userId)
    .order("day_of_month", { ascending: true });

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  })) as PaySchedule[];
}

export async function loadFixedExpenses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<FixedExpense[]> {
  const { data } = await supabase
    .from("pocket_fixed_expenses")
    .select("id,name,amount,currency,day_of_month,category_id,active")
    .eq("user_id", userId)
    .order("day_of_month", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  })) as FixedExpense[];
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
 * Convierte los días de pago configurados en ingresos reales.
 *
 * Se ejecuta al abrir la herramienta y es idempotente: la constraint única
 * (pay_schedule_id, occurred_at) impide que un mismo día se cobre dos veces,
 * así que abrir la página diez veces no infla el balance.
 */
export async function syncPaydays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  schedules: PaySchedule[],
  baseCurrency: string,
  salaryCategoryId: string | null
) {
  const active = schedules.filter((schedule) => schedule.active);
  if (active.length === 0) return;

  const today = new Date();
  const todayIso = isoDate(today);
  const floor = new Date(
    today.getFullYear(),
    today.getMonth() - BACKFILL_MONTHS,
    1
  );

  const rates = new Map<string, number>();

  const rows: Record<string, unknown>[] = [];

  for (const schedule of active) {
    if (!rates.has(schedule.currency)) {
      const converted = await convert(1, schedule.currency, baseCurrency);
      if (!converted) continue;
      rates.set(schedule.currency, converted.rate);
    }

    const rate = rates.get(schedule.currency);
    if (rate == null) continue;

    for (let offset = 0; offset <= BACKFILL_MONTHS; offset++) {
      const year = floor.getFullYear();
      const month = floor.getMonth() + offset;
      const cursor = new Date(year, month, 1);
      const occurred = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        clampDay(schedule.day_of_month, cursor.getFullYear(), cursor.getMonth())
      );
      const occurredIso = isoDate(occurred);

      if (occurredIso > todayIso) continue;

      rows.push({
        user_id: userId,
        kind: "income",
        description: schedule.label,
        amount: schedule.amount,
        currency: schedule.currency,
        amount_base: Math.round(schedule.amount * rate * 100) / 100,
        base_currency: baseCurrency,
        fx_rate: rate,
        category_id: salaryCategoryId,
        pay_schedule_id: schedule.id,
        source: "salary",
        occurred_at: occurredIso,
      });
    }
  }

  if (rows.length === 0) return;

  await supabase
    .from("pocket_transactions")
    .upsert(rows, {
      onConflict: "pay_schedule_id,occurred_at",
      ignoreDuplicates: true,
    });
}
