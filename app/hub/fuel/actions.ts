"use server";

import { revalidatePath } from "next/cache";
import { buildMenu, estimateMeal, FUEL_MESSAGE, planDiet } from "@/lib/ai/fuel";
import {
  baselinePlan,
  clampTarget,
  CUSTOM_PREFIX,
  dayTotals,
  ingredientLabel,
  isCourse,
  isPlanDay,
  PLAN_DAYS,
  PORTIONS,
  type Course,
  type PlanSlots,
  type Activity,
  type Confidence,
  type Goal,
  type Meal,
  type Sex,
} from "@/lib/fuel";
import { fuelPayload } from "@/lib/notifications";
import { sendPush, type PushSubscriptionRow } from "@/lib/push";
import {
  clockLabel,
  FUEL_PATH,
  fuelClient,
  loadMeals,
  loadMenu,
  loadProfile,
  loadWeekPlan,
  MENU_PATH,
  PLAN_PATH,
  PLANNER_PATH,
  today,
  WEEK_PATH,
} from "./data";

function refresh() {
  revalidatePath(FUEL_PATH);
  revalidatePath(PLAN_PATH);
  revalidatePath(MENU_PATH);
  revalidatePath(WEEK_PATH);
  revalidatePath(PLANNER_PATH);
}

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function pick<T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : null;
}

const MIGRATION_ERROR = "Falta correr la migración 0015 de Fuel en Supabase.";

/* -------------------------------------------------------------------------- */
/* El plan                                                                     */
/* -------------------------------------------------------------------------- */

export type PlanState =
  | { status: "idle" }
  | { status: "saved"; offline: boolean }
  | { status: "error"; error: string };

/**
 * Guarda el cuerpo y le pide el plan a la IA.
 *
 * Si la IA no contesta, el plan se arma igual con la fórmula clínica: quien
 * llenó el formulario quiere una meta, y dejarlo sin nada porque un servicio
 * externo está saturado sería castigarlo por algo que no hizo. La pantalla
 * dice cuál de los dos fue.
 */
export async function savePlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const { supabase, user } = await fuelClient();

  const sex = pick<Sex>(formData.get("sex"), ["male", "female"]);
  const goal = pick<Goal>(formData.get("goal"), ["lose", "maintain", "gain"]);
  const activity = pick<Activity>(formData.get("activity"), ["sedentary", "light", "moderate", "high"]);
  const age = toNumber(formData.get("age"));
  const height = toNumber(formData.get("height_cm"));
  const weight = toNumber(formData.get("weight_kg"));

  if (!sex) return { status: "error", error: "Elegí tu sexo: cambia la fórmula." };
  if (!goal) return { status: "error", error: "Elegí si querés bajar, mantener o subir." };
  if (!activity) return { status: "error", error: "Elegí qué tan activo sos." };
  if (age == null || age < 14 || age > 100) return { status: "error", error: "La edad va entre 14 y 100." };
  if (height == null || height < 120 || height > 230)
    return { status: "error", error: "La altura va en centímetros, entre 120 y 230." };
  if (weight == null || weight < 30 || weight > 300)
    return { status: "error", error: "El peso va en kilos, entre 30 y 300." };

  const body = {
    sex,
    goal,
    activity,
    age: Math.round(age),
    height_cm: Math.round(height * 10) / 10,
    weight_kg: Math.round(weight * 10) / 10,
  };

  const reference = baselinePlan(body);
  const answer = await planDiet(body, reference);

  let plan = {
    target_kcal: reference.kcal,
    protein_g: reference.protein,
    carbs_g: reference.carbs,
    fat_g: reference.fat,
    plan_summary: null as string | null,
    plan_tips: [] as string[],
    plan_model: null as string | null,
  };

  if (answer.ok) {
    const target = clampTarget(answer.data.target_kcal, body);
    /*
      Si hubo que recortar las calorías, las macros de la IA ya no suman y
      se reescalan en proporción: la proporción es su criterio, el total es
      el nuestro.
    */
    const declared =
      answer.data.protein_g * 4 + answer.data.carbs_g * 4 + answer.data.fat_g * 9 || target;
    const scale = target / declared;

    plan = {
      target_kcal: target,
      protein_g: Math.round(answer.data.protein_g * scale) || reference.protein,
      carbs_g: Math.round(answer.data.carbs_g * scale) || reference.carbs,
      fat_g: Math.round(answer.data.fat_g * scale) || reference.fat,
      plan_summary: answer.data.summary || null,
      plan_tips: answer.data.tips,
      plan_model: answer.model,
    };
  }

  const { error } = await supabase.from("fuel_profiles").upsert(
    { user_id: user.id, ...body, ...plan, planned_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { status: "error", error: MIGRATION_ERROR };

  refresh();
  return { status: "saved", offline: !answer.ok };
}

export async function setRemind(on: boolean) {
  const { supabase, user } = await fuelClient();
  await supabase.from("fuel_profiles").update({ remind: on }).eq("user_id", user.id);
  refresh();
}

/* -------------------------------------------------------------------------- */
/* Lo que comiste                                                              */
/* -------------------------------------------------------------------------- */

const MAX_BYTES = 4_500_000;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const THUMB_PATTERN = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

export type LogState =
  | { status: "idle" }
  | {
      status: "saved";
      meal: Meal;
      model: string;
      /** El total del día después de sumar esto, para la animación. */
      dayKcal: number;
    }
  | { status: "error"; error: string };

/**
 * El botón grande: foto y/o descripción, la IA estima, se guarda.
 *
 * Se guarda sin pedir confirmación porque el momento de registrar es con el
 * plato enfrente y el tenedor en la mano: cualquier paso extra hace que se
 * deje "para después", y después no existe. Corregir es barato —porción o
 * deshacer— y está en la misma tarjeta del resultado.
 */
export async function logMeal(_prev: LogState, formData: FormData): Promise<LogState> {
  const { supabase, user } = await fuelClient();

  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 280);
  const file = formData.get("image");
  const hasImage = file instanceof File && file.size > 0;

  if (!hasImage && description.length < 3) {
    return { status: "error", error: "Tomale una foto o escribí qué comiste." };
  }
  if (hasImage && !MIME_TYPES.includes(file.type)) {
    return { status: "error", error: "La foto tiene que ser JPG, PNG o WebP." };
  }
  if (hasImage && file.size > MAX_BYTES) {
    return { status: "error", error: "La foto pesa demasiado. Probá con otra." };
  }

  const rawThumb = String(formData.get("thumb") ?? "");
  const thumb = rawThumb.length <= 60_000 && THUMB_PATTERN.test(rawThumb) ? rawThumb : null;

  const result = await estimateMeal({
    description,
    hour: clockLabel(),
    image: hasImage
      ? { base64: Buffer.from(await file.arrayBuffer()).toString("base64"), mimeType: file.type }
      : undefined,
  });

  if (!result.ok) return { status: "error", error: FUEL_MESSAGE[result.kind] };

  const day = today();
  const { data, error } = await supabase
    .from("fuel_meals")
    .insert({
      user_id: user.id,
      eaten_on: day,
      name: result.data.name,
      note: result.data.note || null,
      kcal: result.data.kcal,
      protein_g: result.data.protein_g,
      carbs_g: result.data.carbs_g,
      fat_g: result.data.fat_g,
      confidence: result.data.confidence as Confidence,
      source: hasImage ? "photo" : "text",
      thumb,
      model: result.model,
    })
    .select("id,eaten_on,eaten_at,name,note,kcal,protein_g,carbs_g,fat_g,portion,confidence,source,thumb")
    .single();

  if (error || !data) return { status: "error", error: MIGRATION_ERROR };

  const meals = await loadMeals(supabase, user.id, day);
  refresh();

  return {
    status: "saved",
    meal: meals.find((meal) => meal.id === data.id) ?? (data as unknown as Meal),
    model: result.model,
    dayKcal: dayTotals(meals).kcal,
  };
}

/** "Fue la mitad", "repetí": corrige sin perder lo que calculó la IA. */
export async function setPortion(id: string, portion: number) {
  if (!(PORTIONS as readonly number[]).includes(portion)) return;
  const { supabase, user } = await fuelClient();
  await supabase.from("fuel_meals").update({ portion }).eq("id", id).eq("user_id", user.id);
  refresh();
}

export async function deleteMeal(id: string) {
  const { supabase, user } = await fuelClient();
  await supabase.from("fuel_meals").delete().eq("id", id).eq("user_id", user.id);
  refresh();
}

/**
 * Un plato del menú, registrado tal cual.
 *
 * Las cifras ya las calculó la IA al armar el menú, así que no se vuelve a
 * preguntar: registrar algo que salió de tu propio menú es un toque.
 */
export async function logMenuItem(index: number): Promise<{ ok: boolean; kcal?: number }> {
  const { supabase, user } = await fuelClient();
  const menu = await loadMenu(supabase, user.id);
  const item = menu?.items[index];
  if (!item) return { ok: false };

  const { error } = await supabase.from("fuel_meals").insert({
    user_id: user.id,
    eaten_on: today(),
    name: item.name.slice(0, 80),
    note: item.ingredients.join(", ").slice(0, 280) || null,
    kcal: item.kcal,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
    confidence: "high",
    source: "menu",
    model: menu?.model ?? null,
  });

  if (error) return { ok: false };
  refresh();
  return { ok: true, kcal: item.kcal };
}

/* -------------------------------------------------------------------------- */
/* La despensa y el menú                                                       */
/* -------------------------------------------------------------------------- */

export type MenuState = { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

/** Las claves que llegan del formulario, limpias y sin repetidos. */
function readPantry(formData: FormData) {
  const keys = new Set<string>();

  for (const value of formData.getAll("pantry")) {
    const key = String(value);
    if (key.startsWith(CUSTOM_PREFIX)) {
      const label = key.slice(CUSTOM_PREFIX.length).replace(/\s+/g, " ").trim().slice(0, 40);
      if (label.length >= 2) keys.add(`${CUSTOM_PREFIX}${label}`);
    } else if (ingredientLabel(key)) {
      keys.add(key);
    }
  }

  return [...keys].slice(0, 120);
}

export async function savePantry(formData: FormData) {
  const { supabase, user } = await fuelClient();
  await supabase.from("fuel_profiles").update({ pantry: readPantry(formData) }).eq("user_id", user.id);
  revalidatePath(MENU_PATH);
}

/**
 * Guarda la despensa y le pide a la IA el menú completo: 5 desayunos, 5
 * almuerzos, 5 cenas y 10 aperitivos, dimensionados con la meta del plan.
 */
export async function generateMenu(_prev: MenuState, formData: FormData): Promise<MenuState> {
  const { supabase, user } = await fuelClient();
  const { profile, missing } = await loadProfile(supabase, user.id);

  if (missing) return { status: "error", error: MIGRATION_ERROR };
  if (!profile?.target_kcal) return { status: "error", error: "Primero armá tu plan: el menú se mide con él." };

  const pantry = readPantry(formData);
  if (pantry.length < 5) return { status: "error", error: "Elegí al menos 5 ingredientes." };

  await supabase.from("fuel_profiles").update({ pantry }).eq("user_id", user.id);

  const answer = await buildMenu({
    profile,
    target: {
      kcal: profile.target_kcal,
      protein: profile.protein_g ?? 0,
      carbs: profile.carbs_g ?? 0,
      fat: profile.fat_g ?? 0,
    },
    ingredients: pantry.map((key) => ingredientLabel(key)).filter((label): label is string => !!label),
  });

  if (!answer.ok) {
    return { status: "error", error: FUEL_MESSAGE[answer.kind] };
  }

  const { error } = await supabase.from("fuel_menus").upsert(
    {
      user_id: user.id,
      items: answer.data,
      target_kcal: profile.target_kcal,
      model: answer.model,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { status: "error", error: MIGRATION_ERROR };

  refresh();
  return { status: "saved" };
}

/* -------------------------------------------------------------------------- */
/* Avisos                                                                      */
/* -------------------------------------------------------------------------- */

export type PushState = { status: "saved" | "error"; error?: string };

/** Misma tabla que My Pocket y Clean Daily: el permiso es del dispositivo. */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}): Promise<PushState> {
  const { supabase, user } = await fuelClient();

  const endpoint = String(input.endpoint ?? "").trim();
  const p256dh = String(input.p256dh ?? "").trim();
  const auth = String(input.auth ?? "").trim();

  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return { status: "error", error: "El navegador no devolvió una suscripción válida." };
  }

  const { error } = await supabase.from("pocket_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      label: String(input.label ?? "").slice(0, 60) || null,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { status: "error", error: "No se pudo guardar. ¿Corriste la migración 0003?" };
  return { status: "saved" };
}

export async function deletePushSubscription(endpoint: string) {
  const { supabase, user } = await fuelClient();
  await supabase
    .from("pocket_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", String(endpoint ?? ""));
}

/**
 * Manda el aviso real con los números de hoy, no uno de ejemplo: probar
 * tiene que mostrar exactamente el texto que va a llegar esta noche.
 */
export async function sendFuelTestPush(): Promise<PushState> {
  const { supabase, user } = await fuelClient();
  const [{ profile }, meals, { data: rows }] = await Promise.all([
    loadProfile(supabase, user.id),
    loadMeals(supabase, user.id, today()),
    supabase
      .from("pocket_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", user.id),
  ]);

  if (!profile?.target_kcal) return { status: "error", error: "Primero armá tu plan." };
  if (!rows?.length) return { status: "error", error: "Este dispositivo no tiene avisos activos." };

  const result = await sendPush(
    rows as PushSubscriptionRow[],
    fuelPayload({
      kind: "midday",
      eaten: dayTotals(meals).kcal,
      target: profile.target_kcal,
      goal: profile.goal,
      meals: meals.length,
    })
  );

  if (result.sent === 0) {
    return { status: "error", error: result.errors[0] ?? "No se pudo mandar." };
  }
  return { status: "saved" };
}

/* -------------------------------------------------------------------------- */
/* El menú de la semana                                                        */
/* -------------------------------------------------------------------------- */

export type SlotResult = { ok: true; slots: PlanSlots } | { ok: false; error: string };

const WEEK_MIGRATION_ERROR = "Falta correr la migración 0016 (menú de la semana) en Supabase.";

async function saveSlots(
  supabase: Awaited<ReturnType<typeof fuelClient>>["supabase"],
  userId: string,
  slots: PlanSlots
): Promise<SlotResult> {
  const { error } = await supabase
    .from("fuel_week_plans")
    .upsert({ user_id: userId, slots }, { onConflict: "user_id" });

  if (error) return { ok: false, error: WEEK_MIGRATION_ERROR };
  revalidatePath(PLANNER_PATH);
  return { ok: true, slots };
}

/**
 * Pone (o saca, con `index` nulo) el plato de un tiempo de comida de un día.
 *
 * El plato se copia del menú al plan: si mañana se rehace el menú, la semana
 * ya armada no cambia ni apunta a nada que no exista. Y como cada tiempo es
 * una sola llave del día, escribir un desayuno reemplaza al anterior: dos
 * desayunos el mismo día no tienen dónde vivir.
 */
export async function setSlot(day: string, course: string, index: number | null): Promise<SlotResult> {
  if (!isPlanDay(day) || !isCourse(course)) return { ok: false, error: "Ese día o tiempo no existe." };

  const { supabase, user } = await fuelClient();
  const [menu, plan] = await Promise.all([loadMenu(supabase, user.id), loadWeekPlan(supabase, user.id)]);
  if (plan.missing) return { ok: false, error: WEEK_MIGRATION_ERROR };

  const slots: PlanSlots = { ...plan.slots, [day]: { ...(plan.slots[day] ?? {}) } };
  const chosen = slots[day]!;

  if (index == null) {
    delete chosen[course];
  } else {
    const item = menu?.items[index];
    if (!item || item.course !== course) return { ok: false, error: "Ese plato ya no está en tu menú." };
    chosen[course] = item;
  }

  return saveSlots(supabase, user.id, slots);
}

/**
 * Rellena lo vacío de desayuno, almuerzo y cena rotando los platos del menú,
 * para que ningún plato caiga dos días seguidos. Lo que ya estaba elegido no
 * se toca, y los aperitivos quedan a mano: son opcionales de verdad.
 */
export async function fillWeek(): Promise<SlotResult> {
  const { supabase, user } = await fuelClient();
  const [menu, plan] = await Promise.all([loadMenu(supabase, user.id), loadWeekPlan(supabase, user.id)]);
  if (plan.missing) return { ok: false, error: WEEK_MIGRATION_ERROR };
  if (!menu?.items.length) return { ok: false, error: "Primero armá tu menú." };

  const slots: PlanSlots = { ...plan.slots };
  const courses: Course[] = ["breakfast", "lunch", "dinner"];

  PLAN_DAYS.forEach((day, position) => {
    const current = { ...(slots[day.key] ?? {}) };
    for (const course of courses) {
      if (current[course]) continue;
      const options = menu.items.filter((item) => item.course === course);
      if (options.length > 0) current[course] = options[position % options.length];
    }
    slots[day.key] = current;
  });

  return saveSlots(supabase, user.id, slots);
}

export async function clearWeek(): Promise<SlotResult> {
  const { supabase, user } = await fuelClient();
  return saveSlots(supabase, user.id, {});
}
