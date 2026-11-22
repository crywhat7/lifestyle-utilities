import "server-only";
import { gemini } from "./gemini";
import { postJson } from "./http";
import { logFailure } from "./types";

/**
 * Mirar la foto y decir qué es.
 *
 * Catalogar a mano ciento veinte prendas es escribir ciento veinte veces lo
 * que la foto ya dice: que es una camiseta, que es blanca, que se llama
 * "camiseta blanca". El modelo lo lee de un vistazo y lo que queda para la
 * persona es lo único que la foto no sabe —de quién es, qué tan vieja está,
 * en qué cajón va—.
 *
 * Nunca guarda. Devuelve una PROPUESTA que la pantalla muestra con un botón
 * para aplicarla, porque un modelo que se equivoca y guarda solo es peor que
 * ningún modelo: deja datos que nadie revisó y que parecen revisados.
 *
 * La lista de categorías y colores se le pasa cerrada y se le exige elegir de
 * ahí. Sin eso devuelve "camiseta de algodón blanca lisa" como categoría y
 * "blanco hueso" como color, y el inventario vuelve a ser texto libre, que es
 * exactamente lo que las claves vinieron a evitar.
 */

export type GarmentGuess = {
  name: string;
  category: string;
  color: string | null;
};

export type GarmentRead =
  | { ok: true; guess: GarmentGuess }
  | { ok: false; kind: "no_key" | "unreadable" };

export type GarmentInput = {
  /** La imagen en base64, sin el prefijo `data:`. */
  base64: string;
  mimeType: string;
  categories: { key: string; label: string }[];
  colors: { key: string; label: string }[];
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    category: { type: "STRING" },
    color: { type: "STRING" },
  },
  required: ["name", "category", "color"],
};

function buildPrompt(input: GarmentInput) {
  return [
    "Mirá la foto. Es un objeto de un inventario doméstico: una prenda, un",
    "cable, una herramienta, lo que sea que alguien guarda en su casa.",
    "",
    "Devolvé tres cosas:",
    "",
    "1. name — cómo lo llamaría su dueño, en español rioplatense neutro, de",
    "   dos a cuatro palabras. Lo que lo distingue de otro parecido: el tipo",
    "   y el color o el detalle que salta a la vista. Nada de adjetivos de",
    "   catálogo. Ejemplos buenos: \"Camiseta blanca\", \"Jean azul claro\",",
    "   \"Cable HDMI negro\", \"Crocs azules\". Sin punto final.",
    "",
    "2. category — UNA clave EXACTA de esta lista y de ninguna otra:",
    ...input.categories.map((row) => `   ${row.key} = ${row.label}`),
    "",
    "3. color — UNA clave EXACTA de esta lista, la del color que domina la",
    "   prenda. Si tiene estampado o varios colores parejos, usá \"multi\".",
    "   Si de verdad no se puede decir, devolvé cadena vacía.",
    ...input.colors.map((row) => `   ${row.key} = ${row.label}`),
    "",
    "No inventes claves. No expliques nada. Solo el JSON.",
  ].join("\n");
}

function parse(label: string, text: unknown, input: GarmentInput): GarmentGuess | null {
  if (typeof text !== "string") return null;

  try {
    const raw = JSON.parse(text) as Record<string, unknown>;

    const name = String(raw.name ?? "").trim().slice(0, 80);
    const category = String(raw.category ?? "").trim();
    const color = String(raw.color ?? "").trim();

    /* La clave tiene que existir. Un modelo que devuelve "camiseta" cuando la
       clave es "wear.tshirt" no se corrige con un `includes` generoso: se
       descarta, porque adivinar qué quiso decir es cómo entran los datos
       sucios. */
    const good = input.categories.some((row) => row.key === category);
    if (!name || !good) return null;

    return {
      name,
      category,
      color: input.colors.some((row) => row.key === color) ? color : null,
    };
  } catch (error) {
    logFailure(`${label} devolvió algo que no es JSON`, String(error));
    return null;
  }
}

async function ask(model: string, input: GarmentInput): Promise<GarmentGuess | null> {
  const apiKey = process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
  if (!apiKey) return null;

  const label = `gemini/${model}`;

  const outcome = await postJson(
    label,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": apiKey },
    JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(input) },
            { inline_data: { mime_type: input.mimeType, data: input.base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  return parse(label, payload?.candidates?.[0]?.content?.parts?.[0]?.text, input);
}

export async function readGarment(input: GarmentInput): Promise<GarmentRead> {
  if (!gemini.isConfigured()) return { ok: false, kind: "no_key" };

  for (const model of gemini.models()) {
    const guess = await ask(model, input);
    if (guess) return { ok: true, guess };
  }

  return { ok: false, kind: "unreadable" };
}
