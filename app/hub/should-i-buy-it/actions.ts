"use server";

import { revalidatePath } from "next/cache";
import { fallbackVerdict, type DecisionRecord } from "@/lib/decisions";
import { GEMINI_MODEL, analyzePurchase as askGemini } from "@/lib/gemini";
import {
  DEFAULT_CURRENCY,
  hourlyRate,
  timeCost,
  type WorkProfile,
} from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const TOOL_PATH = "/hub/should-i-buy-it";

export type ProfileState = { status: "idle" | "saved" | "error"; error?: string };

export type AnalyzeState = {
  status: "idle" | "ok" | "error";
  error?: string;
  decision?: DecisionRecord;
};

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function saveWorkProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", error: "Sesión vencida." };

  const monthlyIncome = toNumber(formData.get("monthly_income"));
  const hoursPerDay = toNumber(formData.get("hours_per_day"));
  const daysPerWeek = toNumber(formData.get("days_per_week"));
  const currency = String(formData.get("currency") ?? DEFAULT_CURRENCY);

  if (!monthlyIncome || monthlyIncome <= 0) {
    return { status: "error", error: "Poné cuánto ganás al mes." };
  }
  if (!hoursPerDay || hoursPerDay <= 0 || hoursPerDay > 24) {
    return { status: "error", error: "Las horas al día van de 1 a 24." };
  }
  if (!daysPerWeek || daysPerWeek <= 0 || daysPerWeek > 7) {
    return { status: "error", error: "Los días a la semana van de 1 a 7." };
  }

  const { error } = await supabase.from("work_profiles").upsert(
    {
      user_id: user.id,
      monthly_income: monthlyIncome,
      hours_per_day: hoursPerDay,
      days_per_week: daysPerWeek,
      currency,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración de Supabase?",
    };
  }

  revalidatePath(TOOL_PATH);
  return { status: "saved" };
}

export async function analyze(
  _prev: AnalyzeState,
  formData: FormData
): Promise<AnalyzeState> {
  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", error: "Sesión vencida." };

  const query = String(formData.get("query") ?? "").trim();
  const manualPrice = toNumber(formData.get("price"));

  if (query.length < 2) {
    return { status: "error", error: "Escribí qué querés comprar." };
  }

  const { data: profileRow } = await supabase
    .from("work_profiles")
    .select("monthly_income,hours_per_day,days_per_week,currency,hourly_rate")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow) {
    return { status: "error", error: "Configurá primero tu tarifa." };
  }

  const profile: WorkProfile = {
    monthly_income: Number(profileRow.monthly_income),
    hours_per_day: Number(profileRow.hours_per_day),
    days_per_week: Number(profileRow.days_per_week),
    currency: String(profileRow.currency),
    hourly_rate: Number(profileRow.hourly_rate) || 0,
  };
  const rate = profile.hourly_rate || hourlyRate(profile);

  const ai = await askGemini({
    query,
    knownPrice: manualPrice,
    currency: profile.currency,
    monthlyIncome: profile.monthly_income,
    hourlyRate: rate,
    hoursPerDay: profile.hours_per_day,
    daysPerWeek: profile.days_per_week,
  });

  const price = manualPrice ?? ai?.estimated_price ?? null;

  if (price == null || price <= 0) {
    return {
      status: "error",
      error: "No pudimos estimar el precio. Escribilo a mano y volvé a probar.",
    };
  }

  const cost = timeCost(price, { ...profile, hourly_rate: rate });
  const verdict = ai?.verdict ?? fallbackVerdict(cost.incomeShare);

  const row = {
    user_id: user.id,
    query,
    product_name: ai?.product_name?.slice(0, 120) || query,
    price,
    currency: profile.currency,
    price_is_estimated: manualPrice == null,
    category: ai?.category ?? null,
    purchase_type: ai?.purchase_type ?? null,
    size_bucket: ai?.size_bucket ?? null,
    hours_cost: Number(cost.hours.toFixed(2)),
    work_days_cost: Number(cost.workDays.toFixed(2)),
    income_share: Number(Math.min(cost.incomeShare, 99.9999).toFixed(4)),
    hourly_rate_snap: Number(rate.toFixed(4)),
    verdict,
    ai_opinion: ai?.opinion ?? null,
    ai_model: ai ? GEMINI_MODEL : null,
  };

  const { data: saved, error } = await supabase
    .from("purchase_decisions")
    .insert(row)
    .select()
    .single();

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar la consulta. ¿Corriste la migración?",
    };
  }

  revalidatePath(TOOL_PATH);
  return { status: "ok", decision: saved as DecisionRecord };
}

export async function deleteDecision(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient("lifestyle_utilities");
  await supabase.from("purchase_decisions").delete().eq("id", id);
  revalidatePath(TOOL_PATH);
}
