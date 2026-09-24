import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { minutesIn, TIMEZONE, todayIn } from "@/lib/cron";
import {
  groupDishes,
  rankForNow,
  type FuelProfile,
  type Meal,
  type MenuItem,
  type PastMeal,
  type PlanSlots,
  type Recipe,
} from "@/lib/fuel";
import { createClient } from "@/lib/supabase/server";

export const FUEL_PATH = "/hub/fuel";
export const PLAN_PATH = `${FUEL_PATH}/plan`;
export const MENU_PATH = `${FUEL_PATH}/menu`;
export const WEEK_PATH = `${FUEL_PATH}/semana`;
export const PLANNER_PATH = `${MENU_PATH}/semana`;
export const DISHES_PATH = `${FUEL_PATH}/platos`;

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

/** El menú de la semana, o vacío si todavía no se armó (o falta la 0016). */
export async function loadWeekPlan(client: Client, userId: string) {
  const { data, error } = await client
    .from("fuel_week_plans")
    .select("slots,recipes")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    missing: Boolean(error),
    slots: ((data?.slots as PlanSlots | null) ?? {}) as PlanSlots,
    recipes: ((data?.recipes as Record<string, Recipe> | null) ?? {}) as Record<string, Recipe>,
  };
}

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Cuántas comidas pasadas se miran. Años de registros entran de sobra. */
const HISTORY_LIMIT = 3_000;

/**
 * Todos los platos que registraste, agrupados, con la miniatura de cada uno.
 *
 * Dos consultas y no una a propósito: el historial se lee SIN miniaturas
 * —tres mil fotos de 8 KB serían 24 MB para dibujar una lista—, y después
 * se piden solo las miniaturas de los platos que se van a mostrar.
 */
export async function loadDishes(client: Client, userId: string, limit?: number) {
  const { data } = await client
    .from("fuel_meals")
    .select("id,name,kcal,protein_g,carbs_g,fat_g,portion,source,eaten_on,eaten_at")
    .eq("user_id", userId)
    .order("eaten_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const past: PastMeal[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const [hours, minutes] = CLOCK.format(new Date(String(row.eaten_at))).split(":").map(Number);
    return {
      id: String(row.id),
      name: String(row.name),
      kcal: Number(row.kcal),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
      portion: Number(row.portion),
      source: row.source as PastMeal["source"],
      eaten_on: String(row.eaten_on),
      minutes: hours * 60 + minutes,
    };
  });

  const dishes = rankForNow(groupDishes(past), minutesIn(TIMEZONE));
  const shown = limit ? dishes.slice(0, limit) : dishes;

  const { data: thumbs } = shown.length
    ? await client
        .from("fuel_meals")
        .select("id,thumb")
        .in(
          "id",
          shown.flatMap((dish) => dish.recentIds)
        )
        .not("thumb", "is", null)
    : { data: [] };

  const thumbById = new Map((thumbs ?? []).map((row) => [String(row.id), String(row.thumb)]));

  return shown.map((dish) => ({
    ...dish,
    // La foto más reciente que exista entre las últimas veces.
    thumb: dish.recentIds.map((id) => thumbById.get(id)).find(Boolean) ?? null,
  }));
}

export type ShownDish = Awaited<ReturnType<typeof loadDishes>>[number];
