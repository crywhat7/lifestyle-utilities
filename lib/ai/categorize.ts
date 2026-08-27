import "server-only";
import { ICON_KEYS } from "@/components/category-icons";
import { gemini } from "./gemini";
import { groq } from "./groq";
import { postJson } from "./http";
import { logFailure } from "./types";

/**
 * Clasificador de egresos e ingresos. Misma cascada de proveedores y modelos
 * que "Should I Buy It": Gemini primero, Groq de respaldo.
 *
 * Solo ve las categorías globales. Las personales de cada quien quedan fuera
 * del prompt a propósito: son privadas y la IA no debe empujar a nadie hacia
 * ellas ni exponerlas al crear una nueva.
 */

export type CategorySuggestion = {
  name: string;
  iconKey: string;
  model: string;
};

type Input = {
  description: string;
  amount: number;
  currency: string;
  kind: "income" | "expense";
  /** Nombres de las categorías globales, tal como están escritos en la base. */
  existing: string[];
};

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    icon_key: { type: "STRING", enum: ICON_KEYS },
    is_new: { type: "BOOLEAN" },
  },
  required: ["category", "icon_key", "is_new"],
};

const GROQ_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string" },
    icon_key: { type: "string", enum: ICON_KEYS },
    is_new: { type: "boolean" },
  },
  required: ["category", "icon_key", "is_new"],
  additionalProperties: false,
};

function buildPrompt(input: Input) {
  const noun = input.kind === "income" ? "ingreso" : "egreso";

  return [
    `Clasificás movimientos de dinero en categorías. Este es un ${noun}.`,
    "",
    `Descripción: "${input.description}"`,
    `Monto: ${input.amount} ${input.currency}`,
    "",
    "Categorías que ya existen (usalas TAL CUAL, con la misma ortografía):",
    ...input.existing.map((name) => `- ${name}`),
    "",
    "REGLA PRINCIPAL: reutilizá siempre que se pueda. Solo inventá una",
    "categoría nueva si ninguna de las de arriba abarca razonablemente el",
    "movimiento; ante la duda, elegí la existente más cercana.",
    "",
    "Devolvé:",
    "- category: el nombre exacto de la categoría existente, o el nombre de la",
    "  nueva en español, 1 o 2 palabras, con mayúscula inicial y en singular.",
    "- is_new: true solo si inventaste una categoría que no está en la lista.",
    "- icon_key: el icono que mejor la represente, de la lista permitida.",
  ].join("\n");
}

function parse(label: string, text: unknown) {
  if (typeof text !== "string") {
    logFailure(`${label} respondió sin texto`);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const name = String(parsed?.category ?? "").trim();
    if (!name || name.length > 40) return null;

    const iconKey =
      typeof parsed?.icon_key === "string" &&
      (ICON_KEYS as readonly string[]).includes(parsed.icon_key)
        ? parsed.icon_key
        : "other";

    return { name, iconKey };
  } catch {
    logFailure(`${label} devolvió JSON inválido`, text);
    return null;
  }
}

async function askGemini(model: string, input: Input) {
  const apiKey = process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
  if (!apiKey) return null;

  const label = `gemini/${model}`;
  const outcome = await postJson(
    label,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": apiKey },
    JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
      },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const data = parse(label, payload?.candidates?.[0]?.content?.parts?.[0]?.text);
  return data ? { ...data, model: label } : null;
}

async function askGroq(model: string, input: Input) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const label = `groq/${model}`;
  const outcome = await postJson(
    label,
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: "user", content: buildPrompt(input) }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "category_choice",
          strict: true,
          schema: GROQ_SCHEMA,
        },
      },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    choices?: { message?: { content?: string } }[];
  };
  const data = parse(label, payload?.choices?.[0]?.message?.content);
  return data ? { ...data, model: label } : null;
}

/**
 * Devuelve el nombre de la categoría elegida (existente o nueva). null cuando
 * ningún proveedor contestó: el movimiento se guarda igual, sin categoría,
 * y se puede corregir a mano.
 */
export async function suggestCategory(
  input: Input
): Promise<CategorySuggestion | null> {
  if (gemini.isConfigured()) {
    for (const model of gemini.models()) {
      const result = await askGemini(model, input);
      if (result) return result;
    }
  }

  if (groq.isConfigured()) {
    for (const model of groq.models()) {
      const result = await askGroq(model, input);
      if (result) return result;
    }
  }

  return null;
}
