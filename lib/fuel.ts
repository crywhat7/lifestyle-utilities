/**
 * Fuel — las reglas del contador de calorías.
 *
 * Nada de esto toca la red ni la base: son las cuentas que comparten la
 * pantalla, las acciones del servidor y el cron de los avisos. Si el número
 * grande de la pantalla y el aviso del teléfono salen de la misma función,
 * nunca pueden contradecirse.
 *
 * La IA propone el plan, pero la aritmética base vive acá (Mifflin-St Jeor):
 * sirve de ancla para que una respuesta disparatada no se guarde, y de plan
 * de respaldo cuando no hay IA disponible.
 */

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "high";
export type Goal = "lose" | "maintain" | "gain";
export type Course = "breakfast" | "lunch" | "dinner" | "snack";
export type Confidence = "low" | "medium" | "high";
export type MealSource = "photo" | "text" | "menu";

export type FuelProfile = {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
  goal: Goal;
  target_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  plan_summary: string | null;
  plan_tips: string[];
  plan_model: string | null;
  planned_at: string | null;
  pantry: string[];
  remind: boolean;
};

export type Meal = {
  id: string;
  eaten_on: string;
  eaten_at: string;
  name: string;
  note: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion: number;
  confidence: Confidence | null;
  source: MealSource;
  thumb: string | null;
};

export type MenuItem = {
  course: Course;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
  prep: string;
};

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/* -------------------------------------------------------------------------- */
/* Vocabulario                                                                 */
/* -------------------------------------------------------------------------- */

export const SEX_LABEL: Record<Sex, string> = { female: "Mujer", male: "Hombre" };

export const ACTIVITY_LABEL: Record<Activity, { name: string; hint: string }> = {
  sedentary: { name: "Sentado", hint: "Oficina, casi nada de ejercicio" },
  light: { name: "Ligero", hint: "Caminás o entrenás 1–3 días" },
  moderate: { name: "Activo", hint: "Entrenás 3–5 días por semana" },
  high: { name: "Muy activo", hint: "Entrenás fuerte casi a diario" },
};

export const GOAL_LABEL: Record<Goal, { name: string; verb: string }> = {
  lose: { name: "Bajar", verb: "bajar de peso" },
  maintain: { name: "Mantener", verb: "mantener el peso" },
  gain: { name: "Subir", verb: "subir de peso" },
};

export const COURSE_LABEL: Record<Course, { one: string; many: string }> = {
  breakfast: { one: "Desayuno", many: "Desayunos" },
  lunch: { one: "Almuerzo", many: "Almuerzos" },
  dinner: { one: "Cena", many: "Cenas" },
  snack: { one: "Aperitivo", many: "Aperitivos" },
};

export const COURSES: Course[] = ["breakfast", "lunch", "dinner", "snack"];

/** Lo que se le pide a la IA. Los aperitivos son el doble: se comen más. */
export const COURSE_COUNT: Record<Course, number> = {
  breakfast: 5,
  lunch: 5,
  dinner: 5,
  snack: 10,
};

/**
 * Qué parte del día le toca a cada tiempo de comida.
 *
 * Suma 1 con un aperitivo: el menú propone diez para elegir, no para comerse
 * los diez. Es lo que la IA usa para dimensionar cada plato.
 */
export const COURSE_SHARE: Record<Course, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.28,
  snack: 0.12,
};

/** Correcciones rápidas de porción: "fue la mitad", "repetí". */
export const PORTIONS = [0.5, 1, 1.5, 2] as const;

/* -------------------------------------------------------------------------- */
/* El plan base                                                                */
/* -------------------------------------------------------------------------- */

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

/** Por debajo de esto, sin supervisión médica, no se recomienda comer. */
export function kcalFloor(sex: Sex) {
  return sex === "female" ? 1200 : 1500;
}

type Body = Pick<FuelProfile, "sex" | "age" | "height_cm" | "weight_kg" | "activity" | "goal">;

/** Mifflin-St Jeor: el estándar clínico para el gasto en reposo. */
export function bmr({ sex, age, height_cm, weight_kg }: Body) {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function tdee(body: Body) {
  return bmr(body) * ACTIVITY_FACTOR[body.activity];
}

/** Déficit de ~0.5 kg por semana, superávit suave para no ganar solo grasa. */
const GOAL_DELTA: Record<Goal, number> = { lose: -500, maintain: 0, gain: 350 };

function round10(value: number) {
  return Math.round(value / 10) * 10;
}

/**
 * El plan que sale sin IA: calorías por meta, proteína por kilo, grasa como
 * porción fija y los carbohidratos llenando el resto. Es el respaldo cuando
 * la IA no contesta y el ancla contra la que se valida lo que sí contesta.
 */
export function baselinePlan(body: Body) {
  const kcal = Math.max(kcalFloor(body.sex), round10(tdee(body) + GOAL_DELTA[body.goal]));
  const perKilo = body.goal === "maintain" ? 1.6 : 1.8;
  const protein = Math.round(body.weight_kg * perKilo);
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { kcal, protein, carbs, fat };
}

/**
 * Lo que la IA propone, recortado a lo razonable.
 *
 * Nunca más de un 20% lejos del cálculo clínico ni debajo del piso: una IA
 * que sugiere 900 kcal diarias no se equivoca de estilo, se equivoca de
 * salud, y eso no se guarda.
 */
export function clampTarget(proposed: number, body: Body) {
  const anchor = baselinePlan(body).kcal;
  const value = Number.isFinite(proposed) ? proposed : anchor;
  const bounded = Math.min(anchor * 1.2, Math.max(anchor * 0.8, value));
  return Math.max(kcalFloor(body.sex), round10(bounded));
}

/* -------------------------------------------------------------------------- */
/* El día                                                                      */
/* -------------------------------------------------------------------------- */

export function mealMacros(meal: Pick<Meal, "kcal" | "protein_g" | "carbs_g" | "fat_g" | "portion">): Macros {
  const factor = Number(meal.portion) || 1;
  return {
    kcal: Math.round(meal.kcal * factor),
    protein: Math.round(meal.protein_g * factor),
    carbs: Math.round(meal.carbs_g * factor),
    fat: Math.round(meal.fat_g * factor),
  };
}

export function dayTotals(meals: Meal[]): Macros {
  return meals.reduce<Macros>(
    (sum, meal) => {
      const one = mealMacros(meal);
      return {
        kcal: sum.kcal + one.kcal,
        protein: sum.protein + one.protein,
        carbs: sum.carbs + one.carbs,
        fat: sum.fat + one.fat,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/**
 * En qué punto del día está la persona.
 *
 * `cold` = nada todavía, `burning` = va comiendo, `near` = a menos de un 10%
 * de la meta, `met` = la alcanzó (hasta un 5% de más), `over` = se pasó.
 * El margen existe porque ninguna foto se lee con precisión de caloría: avisar
 * "te pasaste por 12 kcal" sería fingir una exactitud que no hay.
 */
export type DayTone = "cold" | "burning" | "near" | "met" | "over";

export function dayStatus(eaten: number, target: number) {
  const remaining = target - eaten;
  const ratio = target > 0 ? eaten / target : 0;

  let tone: DayTone = "burning";
  if (eaten === 0) tone = "cold";
  else if (ratio > 1.05) tone = "over";
  else if (ratio >= 0.97) tone = "met";
  else if (ratio >= 0.9) tone = "near";

  return { remaining, ratio, tone };
}

/** "1,240" — la cifra con separador de miles, siempre entera. */
export function formatKcal(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

/* -------------------------------------------------------------------------- */
/* Los avisos                                                                  */
/* -------------------------------------------------------------------------- */

export type NudgeKind = "morning" | "midday" | "evening" | "night" | "over";

/**
 * Los cuatro momentos en que el teléfono habla, en minutos desde medianoche.
 *
 * Cada uno tiene una ventana de dos horas porque el cron puede correr cada
 * cinco minutos o cada hora: con la ventana, una corrida horaria a las 11:00
 * todavía agarra el aviso de las 10:30. Que no se repita lo garantiza el
 * candado de `fuel_nudges`, no el reloj.
 */
export const CHECKPOINTS: { kind: Exclude<NudgeKind, "over">; at: number }[] = [
  { kind: "morning", at: 10 * 60 + 30 },
  { kind: "midday", at: 14 * 60 + 30 },
  { kind: "evening", at: 18 * 60 },
  { kind: "night", at: 20 * 60 + 30 },
];

export const CHECKPOINT_WINDOW = 120;

/** El momento que toca ahora, o null si el reloj cae entre dos. */
export function dueCheckpoint(minutes: number) {
  for (let index = CHECKPOINTS.length - 1; index >= 0; index--) {
    const point = CHECKPOINTS[index];
    if (minutes >= point.at && minutes < point.at + CHECKPOINT_WINDOW) {
      return point.kind;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* La despensa                                                                 */
/* -------------------------------------------------------------------------- */

export type IngredientGroup = { key: string; name: string; items: { key: string; label: string }[] };

function group(key: string, name: string, labels: string[]): IngredientGroup {
  return {
    key,
    name,
    items: labels.map((label) => ({ key: `${key}:${slug(label)}`, label })),
  };
}

export function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * El catálogo de lo que se consigue en cualquier pulpería o supermercado de
 * la región. No pretende ser completo: para lo que falta está el campo libre.
 */
export const PANTRY: IngredientGroup[] = [
  group("proteina", "Proteínas", [
    "Huevo",
    "Pechuga de pollo",
    "Muslo de pollo",
    "Carne molida",
    "Bistec de res",
    "Lomo de cerdo",
    "Atún en lata",
    "Tilapia",
    "Camarón",
    "Jamón de pavo",
    "Chorizo",
    "Frijoles rojos",
    "Frijoles negros",
    "Lentejas",
    "Garbanzos",
  ]),
  group("lacteo", "Lácteos", [
    "Leche",
    "Yogur griego",
    "Queso fresco",
    "Queso seco",
    "Quesillo",
    "Mantequilla crema",
    "Requesón",
  ]),
  group("base", "Carbohidratos", [
    "Arroz",
    "Tortilla de maíz",
    "Tortilla de harina",
    "Pan integral",
    "Avena",
    "Papa",
    "Camote",
    "Yuca",
    "Plátano maduro",
    "Plátano verde",
    "Pasta",
    "Granola",
  ]),
  group("verdura", "Verduras", [
    "Tomate",
    "Cebolla",
    "Chile dulce",
    "Lechuga",
    "Repollo",
    "Pepino",
    "Zanahoria",
    "Brócoli",
    "Espinaca",
    "Pataste",
    "Ayote",
    "Hongos",
    "Elote",
  ]),
  group("fruta", "Frutas", [
    "Banano",
    "Piña",
    "Papaya",
    "Sandía",
    "Mango",
    "Manzana",
    "Fresas",
    "Naranja",
    "Limón",
  ]),
  group("grasa", "Grasas y extras", [
    "Aguacate",
    "Aceite de oliva",
    "Maní",
    "Mantequilla de maní",
    "Almendras",
    "Semillas de chía",
    "Chocolate oscuro",
    "Miel",
  ]),
];

const LABEL_BY_KEY = new Map(
  PANTRY.flatMap((entry) => entry.items.map((item) => [item.key, item.label] as const))
);

/** Lo que escribió la persona a mano se guarda como `libre:<texto>`. */
export const CUSTOM_PREFIX = "libre:";

export function ingredientLabel(key: string) {
  if (key.startsWith(CUSTOM_PREFIX)) return key.slice(CUSTOM_PREFIX.length);
  return LABEL_BY_KEY.get(key) ?? null;
}

/* -------------------------------------------------------------------------- */
/* La sugerencia                                                               */
/* -------------------------------------------------------------------------- */

/** Qué tiempo de comida toca según la hora, en minutos desde medianoche. */
export function courseAt(minutes: number): Course {
  if (minutes < 10 * 60 + 30) return "breakfast";
  if (minutes < 15 * 60) return "lunch";
  if (minutes < 17 * 60 + 30) return "snack";
  if (minutes < 21 * 60 + 30) return "dinner";
  return "snack";
}

/**
 * El plato del menú que mejor cabe en lo que te queda.
 *
 * Del tiempo de comida que toca, el más grande que no te pase de la meta:
 * quien tiene 700 kcal a la hora de la cena no quiere que le sugieran la
 * ensalada de 250. Si nada de ese tiempo cabe, el aperitivo más liviano; si
 * ya no queda nada, ninguno —sugerir comida pasada la meta no ayuda a nadie.
 */
export function suggestFromMenu(items: MenuItem[], remaining: number, minutes: number) {
  if (remaining < 80) return null;

  const indexed = items.map((item, index) => ({ item, index }));
  const course = courseAt(minutes);

  const fits = indexed
    .filter(({ item }) => item.course === course && item.kcal <= remaining)
    .sort((a, b) => b.item.kcal - a.item.kcal);
  if (fits.length > 0) {
    // Rota entre los que caben según el día, para no sugerir siempre el mismo.
    const pool = fits.slice(0, 3);
    return pool[new Date().getDate() % pool.length];
  }

  const snacks = indexed
    .filter(({ item }) => item.course === "snack" && item.kcal <= remaining)
    .sort((a, b) => a.item.kcal - b.item.kcal);
  return snacks[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* La semana                                                                   */
/* -------------------------------------------------------------------------- */

/** Una fecha ISO movida N días, sin que la zona del servidor corra el día. */
export function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];

export function weekdayLetter(iso: string) {
  return WEEKDAY_LETTER[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

/** Los siete días que terminan hoy, del más viejo al más nuevo. */
export function lastSevenDays(today: string) {
  return Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));
}

/** Una kcal de más o de menos sostenida ≈ 1/7700 de kilo de grasa. */
export const KCAL_PER_KG = 7700;

export type WeekDay = { day: string; kcal: number; count: number; macros: Macros };

/** Un día "en meta" es uno registrado que quedó entre el 90% y el 105%. */
export function inTarget(kcal: number, target: number) {
  const ratio = kcal / target;
  return ratio >= 0.9 && ratio <= 1.05;
}

/**
 * El resumen de la semana.
 *
 * Solo cuentan los días con algo registrado: un día vacío no es un día de
 * ayuno, es un día sin datos, y meterlo al promedio o al balance mentiría a
 * favor del déficit justo a quien menos registra.
 */
export function weekSummary(days: WeekDay[], target: number) {
  const logged = days.filter((day) => day.count > 0);
  const n = logged.length;
  const sum = (pick: (day: WeekDay) => number) => logged.reduce((total, day) => total + pick(day), 0);

  const balance = sum((day) => day.kcal - target);

  return {
    logged: n,
    average: n ? Math.round(sum((day) => day.kcal) / n) : 0,
    onTarget: logged.filter((day) => inTarget(day.kcal, target)).length,
    balance,
    kg: balance / KCAL_PER_KG,
    macros: {
      protein: n ? Math.round(sum((day) => day.macros.protein) / n) : 0,
      carbs: n ? Math.round(sum((day) => day.macros.carbs) / n) : 0,
      fat: n ? Math.round(sum((day) => day.macros.fat) / n) : 0,
    },
  };
}

/** Las comidas repartidas en sus días; los días sin nada quedan en cero. */
export function groupWeek(meals: Meal[], days: string[]): WeekDay[] {
  return days.map((day) => {
    const own = meals.filter((meal) => meal.eaten_on === day);
    const macros = dayTotals(own);
    return { day, kcal: macros.kcal, count: own.length, macros };
  });
}

/* -------------------------------------------------------------------------- */
/* El menú de la semana                                                        */
/* -------------------------------------------------------------------------- */

export type PlanDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const PLAN_DAYS: { key: PlanDay; name: string; short: string }[] = [
  { key: "mon", name: "Lunes", short: "Lun" },
  { key: "tue", name: "Martes", short: "Mar" },
  { key: "wed", name: "Miércoles", short: "Mié" },
  { key: "thu", name: "Jueves", short: "Jue" },
  { key: "fri", name: "Viernes", short: "Vie" },
  { key: "sat", name: "Sábado", short: "Sáb" },
];

/**
 * Un día es, a lo sumo, un plato por tiempo de comida. Que falte cualquiera
 * —o todos— es válido: hay días que se come afuera.
 */
export type PlanSlots = Partial<Record<PlanDay, Partial<Record<Course, MenuItem>>>>;

export type Recipe = { name: string; servings: string; steps: string[]; tip: string };

export function isPlanDay(value: unknown): value is PlanDay {
  return PLAN_DAYS.some((day) => day.key === value);
}

export function isCourse(value: unknown): value is Course {
  return COURSES.includes(value as Course);
}

export function planDayKcal(slots: PlanSlots, day: PlanDay) {
  return COURSES.reduce((sum, course) => sum + (slots[day]?.[course]?.kcal ?? 0), 0);
}

/**
 * Los platos distintos de la semana, en el orden en que aparecen, con dónde
 * se usa cada uno: el PDF describe cada preparación una sola vez aunque se
 * repita tres días.
 */
export function plannedDishes(slots: PlanSlots) {
  const byName = new Map<string, { item: MenuItem; uses: string[] }>();

  for (const day of PLAN_DAYS) {
    for (const course of COURSES) {
      const item = slots[day.key]?.[course];
      if (!item) continue;
      const entry = byName.get(item.name) ?? { item, uses: [] };
      entry.uses.push(`${day.name} (${COURSE_LABEL[course].one.toLowerCase()})`);
      byName.set(item.name, entry);
    }
  }

  return [...byName.values()];
}
