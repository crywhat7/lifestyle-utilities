import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { minutesIn, TIMEZONE, todayIn } from "@/lib/cron";
import type { FuelProfile, Meal, MenuItem } from "@/lib/fuel";
import { createClient } from "@/lib/supabase/server";

export const FUEL_PATH = "/hub/fuel";
export const PLAN_PATH = `${FUEL_PATH}/plan`;
export const MENU_PATH = `${FUEL_PATH}/menu`;
export const WEEK_PATH = `${FUEL_PATH}/semana`;

/**
 * Qué día es hoy para quien come.
 *
 * El contador se reinicia a medianoche en la zona del bolsillo, la misma que
 * usan los hábitos y el cron: si el servidor decidiera el día en UTC, la cena
 * de las siete de la noche caería en la cuenta de mañana.
 */
export function today() {
  return todayIn(TIMEZONE);
}

/** "19:42" en la misma zona — para el prompt y para la lista. */
export function clockLabel() {
  const minutes = minutesIn(TIMEZONE);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export async function fuelClient() {
  const user = await currentUser();
  if (!user) redirect("/");

  return { supabase: await createClient("lifestyle_utilities"), user };
}

type Client = Awaited<ReturnType<typeof createClient>>;

const PROFILE_COLUMNS =
  "sex,age,height_cm,weight_kg,activity,goal,target_kcal,protein_g,carbs_g,fat_g,plan_summary,plan_tips,plan_model,planned_at,pantry,remind";

/**
 * El perfil, o por qué no hay.
 *
 * `missing` distingue "todavía no llenaste el plan" de "la migración no se
 * corrió": lo primero es un formulario, lo segundo es un aviso para quien
 * administra la base, y confundirlos deja a la persona llenando un
 * formulario que nunca va a guardar.
 */
export async function loadProfile(client: Client, userId: string) {
  const { data, error } = await client
    .from("fuel_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { profile: null, missing: true };
  if (!data) return { profile: null, missing: false };

  const row = data as Record<string, unknown>;
  const profile: FuelProfile = {
    ...(row as unknown as FuelProfile),
    age: Number(row.age),
    height_cm: Number(row.height_cm),
    weight_kg: Number(row.weight_kg),
    plan_tips: (row.plan_tips as string[] | null) ?? [],
    pantry: (row.pantry as string[] | null) ?? [],
  };

  return { profile, missing: false };
}

const MEAL_COLUMNS =
  "id,eaten_on,eaten_at,name,note,kcal,protein_g,carbs_g,fat_g,portion,confidence,source,thumb";

export async function loadMeals(client: Client, userId: string, day: string) {
  return loadMealsBetween(client, userId, day, day);
}

/** Las comidas de un tramo de días, lo último arriba. */
export async function loadMealsBetween(client: Client, userId: string, from: string, to: string) {
  const { data } = await client
    .from("fuel_meals")
    .select(MEAL_COLUMNS)
    .eq("user_id", userId)
    .gte("eaten_on", from)
    .lte("eaten_on", to)
    .order("eaten_at", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        ...row,
        kcal: Number(row.kcal),
        protein_g: Number(row.protein_g),
        carbs_g: Number(row.carbs_g),
        fat_g: Number(row.fat_g),
        portion: Number(row.portion),
      }) as Meal
  );
}

export async function loadMenu(client: Client, userId: string) {
  const { data } = await client
    .from("fuel_menus")
    .select("items,target_kcal,model,created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    items: (Array.isArray(data.items) ? data.items : []) as MenuItem[],
    target: data.target_kcal as number | null,
    model: data.model as string | null,
    createdAt: String(data.created_at),
  };
}
