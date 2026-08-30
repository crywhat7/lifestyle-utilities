import "server-only";
import { ICON_KEYS } from "@/components/category-icons";
import { gemini } from "./gemini";
import { groq } from "./groq";
import { postJson } from "./http";
import { logFailure } from "./types";

/**
 * Lector de capturas del banco.
 *
 * Misma cascada que el resto de la app —Gemini primero, Groq de respaldo—,
 * pero con la imagen adjunta y una sola regla dura: acá solo salen egresos.
 * Un abono en la misma pantalla no es un ingreso que la persona quiso
 * registrar, es ruido de la captura, y meterlo le rompería el balance.
 *
 * La IA también elige categoría en la misma pasada: son diez movimientos y
 * pedir una clasificación por separado para cada uno serían diez viajes más.
 */

export type ScanFailure = "no_key" | "unreadable" | "empty";

export type RawMovement = {
  description: string;
  amount: number;
  currency: string;
  date: string | null;
  status: "posted" | "pending";
  reference: string | null;
  category: string;
  iconKey: string;
};

export type ScanResult =
  | { ok: true; movements: RawMovement[]; model: string }
  | { ok: false; kind: ScanFailure };

export type ScanInput = {
  /** La imagen ya recortada, en base64 sin el prefijo `data:`. */
  base64: string;
  mimeType: string;
  /** Nombres de las categorías globales, tal como están en la base. */
  existing: string[];
  /** Moneda del perfil: se asume cuando la captura no dice cuál es. */
  baseCurrency: string;
  /** Hoy, para resolver fechas sin año y descartar futuros. */
  today: string;
};

const MOVEMENT_PROPERTIES = {
  description: { type: "STRING" },
  amount: { type: "NUMBER" },
  currency: { type: "STRING" },
  date: { type: "STRING" },
  status: { type: "STRING", enum: ["posted", "pending"] },
  reference: { type: "STRING" },
  category: { type: "STRING" },
  icon_key: { type: "STRING", enum: ICON_KEYS },
} as const;

const REQUIRED = [
  "description",
  "amount",
  "currency",
  "date",
  "status",
  "reference",
  "category",
  "icon_key",
];

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    movements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: MOVEMENT_PROPERTIES,
        required: REQUIRED,
      },
    },
  },
  required: ["movements"],
};

function buildPrompt(input: ScanInput) {
  return [
    "Sos un lector de estados de cuenta. La imagen es una captura de los",
    "movimientos bancarios de una persona. Extraé UNA fila por cada egreso",
    "que se vea.",
    "",
    "QUÉ ES UN EGRESO: compras, cargos, débitos, retiros, pagos, comisiones,",
    "transferencias enviadas. Todo lo que baja el saldo.",
    "",
    "QUÉ IGNORAR POR COMPLETO: abonos, depósitos, créditos, reversas,",
    "transferencias recibidas, intereses ganados, el saldo total, los",
    "encabezados y cualquier fila que no sea un movimiento.",
    "",
    "REGLAS:",
    `- Hoy es ${input.today}. Ninguna fecha puede ser futura; si la captura`,
    "  no muestra el año, usá el año que deje la fecha en el pasado más",
    "  cercano. Si una fila no tiene fecha, devolvé null en date.",
    "- amount siempre positivo, sin signo y sin separador de miles.",
    `- currency: el código ISO de 3 letras que muestre la captura. Si no`,
    `  muestra ninguno, usá ${input.baseCurrency}.`,
    "- status: 'pending' si la fila dice pendiente, en proceso, autorizado o",
    "  similar. En cualquier otro caso 'posted'.",
    "- reference: el número de referencia, autorización, documento o boleta de",
    "  esa fila, tal cual. Si la fila no muestra ninguno, null.",
    "- description: el comercio o concepto, limpio y legible, sin el número de",
    "  referencia adentro. Máximo 80 caracteres.",
    "- No inventes filas: si una fila está cortada y no se lee el monto",
    "  completo, no la devuelvas.",
    "",
    "CATEGORÍA de cada egreso. Estas ya existen (usalas TAL CUAL):",
    ...input.existing.map((name) => `- ${name}`),
    "",
    "Reutilizá siempre que se pueda; solo inventá una categoría nueva si",
    "ninguna abarca el movimiento. Nueva = 1 o 2 palabras en español, con",
    "mayúscula inicial y en singular. icon_key: el icono que mejor la",
    "represente, de la lista permitida.",
    "",
    "Si la imagen no es un estado de cuenta o no se ve ningún egreso,",
    "devolvé movements vacío.",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */

/**
 * El símbolo que imprime el banco, traducido a ISO.
 *
 * Solo los que no se prestan a confusión: "L" es lempira y "₡" es colón en
 * cualquier estado de cuenta, pero "$" es cinco monedas distintas según el
 * país, así que se deja vacío y decide la moneda del perfil.
 */
const CURRENCY_SIGNS: Record<string, string> = {
  L: "HNL",
  LPS: "HNL",
  Q: "GTQ",
  GTQ: "GTQ",
  "₡": "CRC",
  "C$": "NIO",
  "B/.": "PAB",
  "€": "EUR",
  EUR: "EUR",
};

function toCurrency(raw: string) {
  const value = raw.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(value)) return value;
  return CURRENCY_SIGNS[value] ?? "";
}

function toMovement(raw: unknown): RawMovement | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const description = String(row.description ?? "")
    .trim()
    .slice(0, 80);
  // El monto llega a veces con el signo de la captura ("-148.00"): acá manda
  // la magnitud, porque el egreso ya sabe que resta.
  const amount = Math.abs(Number(row.amount));

  if (description.length < 2) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency = toCurrency(String(row.currency ?? ""));

  const date = String(row.date ?? "").slice(0, 10);
  const category = String(row.category ?? "").trim();
  const iconKey =
    typeof row.icon_key === "string" &&
    (ICON_KEYS as readonly string[]).includes(row.icon_key)
      ? row.icon_key
      : "other";

  const reference = String(row.reference ?? "").trim();

  return {
    description,
    amount,
    currency,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    status: row.status === "pending" ? "pending" : "posted",
    reference: reference && reference.toLowerCase() !== "null" ? reference : null,
    category: category.slice(0, 40),
    iconKey,
  };
}

/** El texto llega como JSON dentro de JSON; acá se valida fila por fila. */
function parse(label: string, text: unknown): RawMovement[] | null {
  if (typeof text !== "string") {
    logFailure(`${label} respondió sin texto`);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed?.movements) ? parsed.movements : null;
    if (!rows) {
      logFailure(`${label} no devolvió movements`, text);
      return null;
    }

    return rows
      .slice(0, 40)
      .map(toMovement)
      .filter((row: RawMovement | null): row is RawMovement => row !== null);
  } catch {
    logFailure(`${label} devolvió JSON inválido`, text);
    return null;
  }
}

async function askGemini(model: string, input: ScanInput) {
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
            {
              inline_data: { mime_type: input.mimeType, data: input.base64 },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
      },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const rows = parse(
    label,
    payload?.candidates?.[0]?.content?.parts?.[0]?.text
  );

  return rows ? { rows, model: label } : null;
}

/**
 * Respaldo con visión. El modelo se puede forzar con POCKET_SCAN_GROQ_MODEL
 * porque los que leen imágenes en Groq rotan más seguido que los de texto.
 */
const GROQ_VISION_MODELS = ["meta-llama/llama-4-scout-17b-16e-instruct"];

async function askGroq(model: string, input: ScanInput) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const label = `groq/${model}`;
  const outcome = await postJson(
    label,
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${buildPrompt(input)}\n\nDevolvé solo JSON: {"movements":[{"description":"","amount":0,"currency":"","date":null,"status":"posted","reference":null,"category":"","icon_key":""}]}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.base64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    choices?: { message?: { content?: string } }[];
  };
  const rows = parse(label, payload?.choices?.[0]?.message?.content);

  return rows ? { rows, model: label } : null;
}

/**
 * Lee la captura. `empty` es distinto de `unreadable`: en el primero la IA
 * miró y no había egresos —la persona recortó de más, o subió otra cosa—,
 * en el segundo nadie contestó y vale la pena reintentar.
 */
export async function scanExpenses(input: ScanInput): Promise<ScanResult> {
  if (!gemini.isConfigured() && !groq.isConfigured()) {
    return { ok: false, kind: "no_key" };
  }

  let answered = false;

  if (gemini.isConfigured()) {
    for (const model of gemini.models()) {
      const result = await askGemini(model, input);
      if (!result) continue;
      answered = true;
      if (result.rows.length > 0) {
        return { ok: true, movements: result.rows, model: result.model };
      }
      break;
    }
  }

  if (!answered && groq.isConfigured()) {
    const forced = process.env.POCKET_SCAN_GROQ_MODEL?.trim();
    for (const model of forced ? [forced] : GROQ_VISION_MODELS) {
      const result = await askGroq(model, input);
      if (!result) continue;
      answered = true;
      if (result.rows.length > 0) {
        return { ok: true, movements: result.rows, model: result.model };
      }
      break;
    }
  }

  return { ok: false, kind: answered ? "empty" : "unreadable" };
}
