"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fallbackVerdict, sizeBucket } from "@/lib/decisions";
import { convert } from "@/lib/fx";
import { analyzePurchase as askAi } from "@/lib/ai";
import {
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  hourlyRate,
  timeCost,
  type WorkProfile,
} from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const TOOL_PATH = "/hub/should-i-buy-it";

export type ProfileState = { status: "idle" | "saved" | "error"; error?: string };

export type StartState = { status: "idle" | "error"; error?: string };

/** La IA a veces devuelve strings vacíos o listas larguísimas. */
function cleanList(list: string[] | undefined) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 4);
}

/**
 * La IA puede salirse del enum aunque el esquema lo prohíba. Si eso llegara a
 * la base, el check constraint tumbaría el update entero: mejor descartarlo.
 */
const PURCHASE_TYPES = ["necesidad", "inversion", "antojo", "impulso"];
const VERDICTS = ["buy", "think", "skip"];

function pick<T extends string>(value: unknown, allowed: string[]): T | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T)
    : null;
}

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadProfile(userId: string) {
  const supabase = await createClient("lifestyle_utilities");
  const { data } = await supabase
    .from("work_profiles")
    .select("monthly_income,hours_per_day,days_per_week,currency,hourly_rate")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const profile: WorkProfile = {
    monthly_income: Number(data.monthly_income),
    hours_per_day: Number(data.hours_per_day),
    days_per_week: Number(data.days_per_week),
    currency: String(data.currency),
    hourly_rate: Number(data.hourly_rate) || 0,
  };
  profile.hourly_rate = profile.hourly_rate || hourlyRate(profile);
  return profile;
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

/**
 * Guarda la consulta con lo que ya se puede calcular sin esperar a nadie
 * y manda a la página de detalle. La IA completa la fila después.
 */
export async function startDecision(
  _prev: StartState,
  formData: FormData
): Promise<StartState> {
  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", error: "Sesión vencida." };

  const query = String(formData.get("query") ?? "").trim();
  if (query.length < 2) {
    return { status: "error", error: "Escribí qué querés comprar." };
  }

  const profile = await loadProfile(user.id);
  if (!profile) {
    return { status: "error", error: "Configurá primero tu tarifa." };
  }

  const rawPrice = toNumber(formData.get("price"));
  const rawCurrency = String(formData.get("purchase_currency") ?? "");
  const purchaseCurrency = CURRENCY_CODES.includes(
    rawCurrency as (typeof CURRENCY_CODES)[number]
  )
    ? rawCurrency
    : profile.currency;

  let price: number | null = null;
  let fxRate: number | null = null;

  if (rawPrice != null && rawPrice > 0) {
    const converted = await convert(
      rawPrice,
      purchaseCurrency,
      profile.currency
    );

    if (!converted) {
      return {
        status: "error",
        error: `No pudimos convertir de ${purchaseCurrency} a ${profile.currency}. Probá de nuevo.`,
      };
    }

    price = Math.round(converted.amount * 100) / 100;
    fxRate = converted.rate;
  }

  const cost = price != null ? timeCost(price, profile) : null;

  const { data: created, error } = await supabase
    .from("purchase_decisions")
    .insert({
      user_id: user.id,
      query,
      product_name: query,
      price,
      currency: profile.currency,
      price_original: rawPrice,
      purchase_currency: rawPrice != null ? purchaseCurrency : null,
      fx_rate: fxRate,
      price_is_estimated: price == null,
      hours_cost: cost ? Number(cost.hours.toFixed(2)) : null,
      work_days_cost: cost ? Number(cost.workDays.toFixed(2)) : null,
      income_share: cost ? Number(cost.incomeShare.toFixed(4)) : null,
      size_bucket: cost ? sizeBucket(cost.incomeShare) : null,
      hourly_rate_snap: Number(profile.hourly_rate.toFixed(4)),
      verdict: cost ? fallbackVerdict(cost.incomeShare) : null,
      ai_status: "pending",
    })
    .select("id")
    .single();

  if (error || !created) {
    return {
      status: "error",
      error: "No se pudo guardar la consulta. ¿Corriste la migración?",
    };
  }

  redirect(`${TOOL_PATH}/${created.id}`);
}

/**
 * Segunda fase: la IA nombra el producto, lo clasifica, estima el precio si
 * hacía falta y arma pros, contras y recomendación.
 */
export async function enrichDecision(id: string) {
  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: decision } = await supabase
    .from("purchase_decisions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!decision || decision.ai_status !== "pending") return;

  const profile = await loadProfile(user.id);
  if (!profile) return;

  const knownPrice = decision.price != null ? Number(decision.price) : null;

  const result = await askAi({
    query: String(decision.query),
    knownPrice,
    knownHours:
      knownPrice != null ? timeCost(knownPrice, profile).hours : null,
    currency: profile.currency,
    monthlyIncome: profile.monthly_income,
    hourlyRate: profile.hourly_rate,
    hoursPerDay: profile.hours_per_day,
    daysPerWeek: profile.days_per_week,
  });

  if (!result.ok) {
    await supabase
      .from("purchase_decisions")
      .update({ ai_status: "failed", ai_error: result.kind })
      .eq("id", id)
      .eq("user_id", user.id);
    revalidatePath(`${TOOL_PATH}/${id}`);
    return;
  }

  const ai = result.data;
  const price = knownPrice ?? ai.estimated_price;
  const cost = timeCost(price, profile);

  await supabase
    .from("purchase_decisions")
    .update({
      product_name: ai.product_name?.slice(0, 120) || String(decision.query),
      price: Math.round(price * 100) / 100,
      hours_cost: Number(cost.hours.toFixed(2)),
      work_days_cost: Number(cost.workDays.toFixed(2)),
      income_share: Number(cost.incomeShare.toFixed(4)),
      size_bucket: sizeBucket(cost.incomeShare),
      category: ai.category ?? null,
      purchase_type: pick(ai.purchase_type, PURCHASE_TYPES),
      verdict:
        pick(ai.verdict, VERDICTS) ?? fallbackVerdict(cost.incomeShare),
      ai_opinion: ai.opinion ?? null,
      ai_model: result.model,
      pros: cleanList(ai.pros),
      cons: cleanList(ai.cons),
      ai_status: "ready",
      ai_error: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath(`${TOOL_PATH}/${id}`);
  revalidatePath(TOOL_PATH);
}

/**
 * Devuelve la consulta a 'pending'. Al re-renderizar, la página vuelve a
 * disparar enrichDecision: un solo camino de código para el análisis.
 */
export async function retryAnalysis(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("purchase_decisions")
    .update({ ai_status: "pending", ai_error: null })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath(`${TOOL_PATH}/${id}`);
}

export async function deleteDecision(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient("lifestyle_utilities");
  await supabase.from("purchase_decisions").delete().eq("id", id);
  revalidatePath(TOOL_PATH);
}
