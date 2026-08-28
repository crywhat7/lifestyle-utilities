import "server-only";
import { redirect } from "next/navigation";
import { hourlyRate, type WorkProfile } from "@/lib/money";
import {
  monthStart,
  type FixedExpense,
  type PaySchedule,
  type PocketCategory,
  type PocketTransaction,
} from "@/lib/pocket";
import { createClient } from "@/lib/supabase/server";

export const POCKET_PATH = "/hub/my-pocket";

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

/**
 * Qué gastos fijos ya quedaron registrados este mes.
 *
 * La fila del gasto guarda su `fixed_expense_id`, así que no hay que adivinar
 * por nombre: o está la transacción del mes o el gasto sigue pendiente.
 */
export async function loadPaidFixedThisMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("pocket_transactions")
    .select("fixed_expense_id")
    .eq("user_id", userId)
    .eq("source", "fixed")
    .gte("occurred_at", monthStart())
    .not("fixed_expense_id", "is", null);

  return new Set(
    (data ?? [])
      .map((row) => row.fixed_expense_id as string | null)
      .filter((id): id is string => Boolean(id))
  );
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
