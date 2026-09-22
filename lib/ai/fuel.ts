import "server-only";
import {
  ACTIVITY_LABEL,
  COURSE_COUNT,
  COURSE_LABEL,
  COURSE_SHARE,
  COURSES,
  GOAL_LABEL,
  SEX_LABEL,
  type Confidence,
  type Course,
  type FuelProfile,
  type MenuItem,
} from "@/lib/fuel";
import { gemini } from "./gemini";
import { groq } from "./groq";
import { postJson } from "./http";
import { logFailure } from "./types";

/**
 * Las tres preguntas de Fuel a la IA: el plan diario, el menú de la semana y
 * —la que importa— cuántas calorías tiene lo que acabás de comer.
 *
 * Misma cascada que el resto de la app: Gemini primero, modelo por modelo, y
 * Groq de respaldo. La foto solo la leen los modelos con visión, así que en
 * Groq se cambia de modelo cuando viene una imagen.
 */

export type FuelFailure = "no_key" | "unavailable" | "not_food";

export const FUEL_MESSAGE: Record<FuelFailure, string> = {
  no_key: "La IA no está configurada en el servidor.",
  unavailable: "La IA no contestó. Probá de nuevo en un momento.",
  not_food: "Eso no parece comida. Probá con otra foto o describilo.",
};

type Image = { base64: string; mimeType: string };

type Ask<T> = {
  prompt: string;
  /** Esquema en el dialecto de Gemini (tipos en mayúsculas). */
  schema: object;
  /** El molde que se le muestra a Groq, que solo recibe `json_object`. */
  example: string;
  temperature: number;
  image?: Image;
  parse: (value: unknown) => T | null;
};

type Answer<T> = { ok: true; data: T; model: string } | { ok: false; kind: "no_key" | "unavailable" };

/** Los modelos de Groq que ven imágenes rotan seguido: se puede forzar uno. */
const GROQ_VISION_MODELS = ["meta-llama/llama-4-scout-17b-16e-instruct"];

function decode<T>(label: string, text: unknown, parse: (value: unknown) => T | null) {
  if (typeof text !== "string") {
    logFailure(`${label} respondió sin texto`);
    return null;
  }

  try {
    const value = parse(JSON.parse(text));
    if (!value) logFailure(`${label} devolvió algo fuera del molde`, text);
    return value;
  } catch {
    logFailure(`${label} devolvió JSON inválido`, text);
    return null;
  }
}

async function askGemini<T>(model: string, ask: Ask<T>) {
  const apiKey = process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
  if (!apiKey) return null;

  const label = `gemini/${model}`;
  const parts: object[] = [{ text: ask.prompt }];
  if (ask.image) {
    parts.push({ inline_data: { mime_type: ask.image.mimeType, data: ask.image.base64 } });
  }

  const outcome = await postJson(
    label,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": apiKey },
    JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: ask.temperature,
        responseMimeType: "application/json",
        responseSchema: ask.schema,
      },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const data = decode(label, payload?.candidates?.[0]?.content?.parts?.[0]?.text, ask.parse);
  return data ? { data, model: label } : null;
}

async function askGroq<T>(model: string, ask: Ask<T>) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const label = `groq/${model}`;
  const text = `${ask.prompt}\n\nDevolvé solo JSON con esta forma exacta: ${ask.example}`;
  const content = ask.image
    ? [
        { type: "text", text },
        {
          type: "image_url",
          image_url: { url: `data:${ask.image.mimeType};base64,${ask.image.base64}` },
        },
      ]
    : text;

  const outcome = await postJson(
    label,
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    JSON.stringify({
      model,
      temperature: ask.temperature,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as { choices?: { message?: { content?: string } }[] };
  const data = decode(label, payload?.choices?.[0]?.message?.content, ask.parse);
  return data ? { data, model: label } : null;
}

async function ask<T>(request: Ask<T>): Promise<Answer<T>> {
  if (!gemini.isConfigured() && !groq.isConfigured()) return { ok: false, kind: "no_key" };

  if (gemini.isConfigured()) {
    for (const model of gemini.models()) {
      const result = await askGemini(model, request);
      if (result) return { ok: true, ...result };
    }
  }

  if (groq.isConfigured()) {
    const forced = process.env.POCKET_SCAN_GROQ_MODEL?.trim();
    const models = request.image ? (forced ? [forced] : GROQ_VISION_MODELS) : groq.models();

    for (const model of models) {
      const result = await askGroq(model, request);
      if (result) return { ok: true, ...result };
    }
  }

  return { ok: false, kind: "unavailable" };
}

/* -------------------------------------------------------------------------- */
/* Utilidades de lectura                                                       */
/* -------------------------------------------------------------------------- */

function num(value: unknown, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(max, parsed);
}

function text(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function list(value: unknown, max: number, each: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, each))
    .filter(Boolean)
    .slice(0, max);
}

function bodyLines(profile: Pick<FuelProfile, "sex" | "age" | "height_cm" | "weight_kg" | "activity" | "goal">) {
  return [
    `- Sexo: ${SEX_LABEL[profile.sex]}`,
    `- Edad: ${profile.age} años`,
    `- Altura: ${profile.height_cm} cm`,
    `- Peso: ${profile.weight_kg} kg`,
    `- Actividad: ${ACTIVITY_LABEL[profile.activity].name} (${ACTIVITY_LABEL[profile.activity].hint.toLowerCase()})`,
    `- Objetivo: ${GOAL_LABEL[profile.goal].verb}`,
  ];
}

const VOICE = [
  "Escribí en español con voseo centroamericano (comé, tomá, sumá).",
  "Nada de muletillas rioplatenses como che o dale, nada de moralina ni culpa.",
];

/* -------------------------------------------------------------------------- */
/* El plan diario                                                              */
/* -------------------------------------------------------------------------- */

export type PlanDraft = {
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  summary: string;
  tips: string[];
};

export async function planDiet(
  profile: Pick<FuelProfile, "sex" | "age" | "height_cm" | "weight_kg" | "activity" | "goal">,
  reference: { kcal: number; protein: number; carbs: number; fat: number }
) {
  const prompt = [
    "Sos nutricionista. Armá el plan de calorías diarias de esta persona.",
    "",
    ...bodyLines(profile),
    "",
    `Como referencia, Mifflin-St Jeor con su actividad da ${reference.kcal} kcal para su objetivo,`,
    `con ${reference.protein} g de proteína, ${reference.carbs} g de carbohidratos y ${reference.fat} g de grasa.`,
    "Ajustalo solo si tenés una razón concreta; nunca bajes de 1200 kcal (mujer) o 1500 (hombre)",
    "y nunca propongas un déficit mayor a 750 kcal ni un superávit mayor a 500.",
    "",
    "Devolvé:",
    "- target_kcal, protein_g, carbs_g, fat_g: enteros. Las macros tienen que sumar las calorías (4/4/9).",
    "- summary: 2 frases que expliquen el plan y qué esperar por semana, con números.",
    "- tips: 3 consejos prácticos y específicos para su objetivo, máximo 16 palabras cada uno.",
    ...VOICE,
  ].join("\n");

  return ask<PlanDraft>({
    prompt,
    temperature: 0.3,
    schema: {
      type: "OBJECT",
      properties: {
        target_kcal: { type: "NUMBER" },
        protein_g: { type: "NUMBER" },
        carbs_g: { type: "NUMBER" },
        fat_g: { type: "NUMBER" },
        summary: { type: "STRING" },
        tips: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["target_kcal", "protein_g", "carbs_g", "fat_g", "summary", "tips"],
    },
    example:
      '{"target_kcal":2000,"protein_g":140,"carbs_g":210,"fat_g":65,"summary":"","tips":["",""]}',
    parse(value) {
      const row = value as Record<string, unknown>;
      const kcal = num(row?.target_kcal, 6000);
      if (!kcal) return null;
      return {
        target_kcal: kcal,
        protein_g: num(row.protein_g, 500) ?? 0,
        carbs_g: num(row.carbs_g, 900) ?? 0,
        fat_g: num(row.fat_g, 400) ?? 0,
        summary: text(row.summary, 600),
        tips: list(row.tips, 4, 140),
      };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* El menú                                                                     */
/* -------------------------------------------------------------------------- */

export async function buildMenu(input: {
  profile: Pick<FuelProfile, "goal">;
  target: { kcal: number; protein: number; carbs: number; fat: number };
  ingredients: string[];
}) {
  const sizing = COURSES.map(
    (course) =>
      `- ${COURSE_COUNT[course]} ${COURSE_LABEL[course].many.toLowerCase()} (course "${course}") de unas ${Math.round(
        (input.target.kcal * COURSE_SHARE[course]) / 10
      ) * 10} kcal cada uno`
  );

  const prompt = [
    "Sos cocinero y nutricionista en Centroamérica. Armá un menú variado para una persona",
    `que quiere ${GOAL_LABEL[input.profile.goal].verb}, con una meta de ${input.target.kcal} kcal diarias`,
    `(${input.target.protein} g proteína, ${input.target.carbs} g carbohidratos, ${input.target.fat} g grasa).`,
    "",
    "Ingredientes que tiene o puede comprar:",
    ...input.ingredients.map((item) => `- ${item}`),
    "",
    "Asumí que siempre hay sal, pimienta, ajo, agua, café y especias básicas.",
    "Usá SOLO esos ingredientes más lo básico. No repitas platos ni la misma base dos veces seguidas.",
    "",
    "Pedido:",
    ...sizing,
    "",
    "Cada plato:",
    "- name: nombre corto y apetitoso, máximo 6 palabras.",
    "- kcal, protein_g, carbs_g, fat_g: enteros, de UNA porción.",
    "- ingredients: los ingredientes con cantidad casera (\"2 huevos\", \"½ taza de arroz\").",
    "- prep: cómo se hace en una sola frase de máximo 22 palabras.",
    ...VOICE,
  ].join("\n");

  return ask<MenuItem[]>({
    prompt,
    temperature: 0.8,
    schema: {
      type: "OBJECT",
      properties: {
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              course: { type: "STRING", enum: COURSES },
              name: { type: "STRING" },
              kcal: { type: "NUMBER" },
              protein_g: { type: "NUMBER" },
              carbs_g: { type: "NUMBER" },
              fat_g: { type: "NUMBER" },
              ingredients: { type: "ARRAY", items: { type: "STRING" } },
              prep: { type: "STRING" },
            },
            required: ["course", "name", "kcal", "protein_g", "carbs_g", "fat_g", "ingredients", "prep"],
          },
        },
      },
      required: ["items"],
    },
    example:
      '{"items":[{"course":"breakfast","name":"","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"ingredients":[""],"prep":""}]}',
    parse(value) {
      const rows = (value as { items?: unknown })?.items;
      if (!Array.isArray(rows)) return null;

      const items = rows
        .map((raw): MenuItem | null => {
          const row = raw as Record<string, unknown>;
          const course = row?.course as Course;
          const name = text(row?.name, 60);
          const kcal = num(row?.kcal, 3000);
          if (!COURSES.includes(course) || !name || !kcal) return null;

          return {
            course,
            name,
            kcal: Math.round(kcal),
            protein_g: Math.round(num(row.protein_g, 300) ?? 0),
            carbs_g: Math.round(num(row.carbs_g, 500) ?? 0),
            fat_g: Math.round(num(row.fat_g, 300) ?? 0),
            ingredients: list(row.ingredients, 12, 60),
            prep: text(row.prep, 220),
          };
        })
        .filter((item): item is MenuItem => item !== null);

      // Un menú al que le falta un tiempo entero no sirve: que pruebe otro modelo.
      const complete = COURSES.every((course) => items.some((item) => item.course === course));
      if (!complete) return null;

      return COURSES.flatMap((course) =>
        items.filter((item) => item.course === course).slice(0, COURSE_COUNT[course])
      );
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Lo que acabás de comer                                                      */
/* -------------------------------------------------------------------------- */

export type MealEstimate = {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: Confidence;
  note: string;
};

export type EstimateResult =
  | { ok: true; data: MealEstimate; model: string }
  | { ok: false; kind: FuelFailure };

/**
 * Cuántas calorías tiene lo que se ve en la foto (y/o lo que dice el texto).
 *
 * La descripción manda sobre la foto: si la persona escribió "sin azúcar" o
 * "fue media porción", eso es un dato que la imagen no puede mostrar.
 */
export async function estimateMeal(input: {
  description: string;
  image?: Image;
  hour: string;
}): Promise<EstimateResult> {
  const prompt = [
    "Sos nutricionista y estimás calorías de comidas reales en Centroamérica.",
    input.image
      ? "La imagen es una foto de lo que la persona comió recién."
      : "No hay foto: estimá solo con la descripción.",
    input.description
      ? `La persona lo describe así: "${input.description}". Esa descripción manda sobre la foto (porciones, ingredientes ocultos, lo que no se comió).`
      : "La persona no agregó descripción.",
    `Son las ${input.hour}.`,
    "",
    "Estimá lo que se ve completo, como UNA sola ingesta. Pensá en porciones típicas de la región,",
    "en el aceite de la cocción y en lo que suele acompañar (crema, salsas, bebida si aparece).",
    "",
    "Devolvé:",
    "- is_food: false si la imagen o el texto no muestran algo comestible.",
    "- name: el plato en español, corto y reconocible, máximo 6 palabras.",
    "- kcal, protein_g, carbs_g, fat_g: tu mejor estimación, enteros.",
    "- confidence: high si se ve claro y la porción es evidente, medium si hay que suponer, low si es muy incierto.",
    "- note: una frase de máximo 18 palabras con lo que más pesa en el total o lo que supusiste.",
    ...VOICE,
  ].join("\n");

  const answer = await ask<MealEstimate & { is_food: boolean }>({
    prompt,
    temperature: 0.2,
    image: input.image,
    schema: {
      type: "OBJECT",
      properties: {
        is_food: { type: "BOOLEAN" },
        name: { type: "STRING" },
        kcal: { type: "NUMBER" },
        protein_g: { type: "NUMBER" },
        carbs_g: { type: "NUMBER" },
        fat_g: { type: "NUMBER" },
        confidence: { type: "STRING", enum: ["low", "medium", "high"] },
        note: { type: "STRING" },
      },
      required: ["is_food", "name", "kcal", "protein_g", "carbs_g", "fat_g", "confidence", "note"],
    },
    example:
      '{"is_food":true,"name":"","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"medium","note":""}',
    parse(value) {
      const row = value as Record<string, unknown>;
      if (!row || typeof row !== "object") return null;
      const kcal = num(row.kcal, 5000);
      if (kcal == null) return null;

      const confidence = ["low", "medium", "high"].includes(String(row.confidence))
        ? (row.confidence as Confidence)
        : "medium";

      return {
        is_food: row.is_food !== false,
        name: text(row.name, 80) || "Comida",
        kcal: Math.round(kcal),
        protein_g: Math.round((num(row.protein_g, 500) ?? 0) * 10) / 10,
        carbs_g: Math.round((num(row.carbs_g, 900) ?? 0) * 10) / 10,
        fat_g: Math.round((num(row.fat_g, 400) ?? 0) * 10) / 10,
        confidence,
        note: text(row.note, 200),
      };
    },
  });

  if (!answer.ok) return answer;
  if (!answer.data.is_food) return { ok: false, kind: "not_food" };

  const { is_food: _food, ...data } = answer.data;
  void _food;
  return { ok: true, data, model: answer.model };
}
