import "server-only";
import { ICON_KEYS } from "@/components/category-icons";
import { gemini } from "./gemini";
import { groq } from "./groq";
import { postJson } from "./http";
import { logFailure } from "./types";

/**
 * Dictar un egreso.
 *
 * Dos pasos, a propósito. Primero se transcribe —Whisper en Groq, que es
 * barato, rápido y entiende el español de la región—, y después se interpreta
 * el texto con la misma cascada que el resto de la app. Separarlos deja ver
 * qué se escuchó cuando la lectura sale mal: si el monto quedó raro, la
 * transcripción en pantalla dice si falló el oído o el criterio.
 */

export type VoiceFailure = "no_key" | "unclear" | "unheard";

export type VoiceDraft = {
  description: string;
  amount: number;
  currency: string;
  date: string | null;
  category: string;
  iconKey: string;
};

export type VoiceResult =
  | { ok: true; transcript: string; draft: VoiceDraft }
  | { ok: false; kind: VoiceFailure; transcript?: string };

export type VoiceInput = {
  audio: File;
  /** Nombres de las categorías globales, tal como están en la base. */
  existing: string[];
  baseCurrency: string;
  today: string;
};

/* -------------------------------------------------------------------------- */
/* Paso 1 — oír                                                                */
/* -------------------------------------------------------------------------- */

const TRANSCRIBE_MODEL =
  process.env.POCKET_VOICE_MODEL?.trim() || "whisper-large-v3-turbo";

/**
 * Siete segundos de audio son doscientos kilobytes: no hay nada que
 * reintentar con paciencia, o el servicio contesta o no contesta. Por eso
 * esto no usa `postJson` — va en multipart y con un timeout corto.
 */
async function transcribe(audio: File): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const body = new FormData();
  body.append("file", audio);
  body.append("model", TRANSCRIBE_MODEL);
  body.append("language", "es");
  body.append("response_format", "json");
  body.append("temperature", "0");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (!response.ok) {
      logFailure(
        `groq/${TRANSCRIBE_MODEL} devolvió HTTP ${response.status}`,
        await response.text().catch(() => "")
      );
      return null;
    }

    const payload = (await response.json()) as { text?: string };
    const text = String(payload?.text ?? "").trim();

    return text.length > 1 ? text.slice(0, 400) : null;
  } catch (error) {
    logFailure(
      `groq/${TRANSCRIBE_MODEL} falló al transcribir`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Paso 2 — entender                                                           */
/* -------------------------------------------------------------------------- */

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { type: "STRING" },
    amount: { type: "NUMBER" },
    currency: { type: "STRING" },
    date: { type: "STRING" },
    category: { type: "STRING" },
    icon_key: { type: "STRING", enum: ICON_KEYS },
  },
  required: ["description", "amount", "currency", "date", "category", "icon_key"],
};

const GROQ_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string" },
    date: { type: "string" },
    category: { type: "string" },
    icon_key: { type: "string", enum: ICON_KEYS },
  },
  required: ["description", "amount", "currency", "date", "category", "icon_key"],
  additionalProperties: false,
};

function buildPrompt(transcript: string, input: VoiceInput) {
  return [
    "Alguien dictó un gasto en voz alta. Esto es lo que dijo, transcrito:",
    "",
    `"${transcript}"`,
    "",
    "Convertilo en un egreso.",
    "",
    "REGLAS:",
    "- amount: solo el número, positivo. 'dos cincuenta' en un gasto hablado",
    "  suele ser 250, no 2.50: elegí la lectura que tenga sentido para una",
    "  compra cotidiana.",
    `- currency: el código ISO si lo dijo ('dólares' = USD, 'lempiras' = HNL,`,
    `  'quetzales' = GTQ). Si no dijo ninguna, ${input.baseCurrency}.`,
    `- date: hoy es ${input.today}. Entendé 'ayer', 'anteayer', 'el lunes'.`,
    "  Nunca una fecha futura. Si no dijo cuándo, usá hoy.",
    "- description: en qué se fue, corto y natural, como lo escribiría la",
    "  persona. Sin el monto adentro. Máximo 60 caracteres. Primera letra en",
    "  mayúscula.",
    "",
    "CATEGORÍA. Estas ya existen (usalas TAL CUAL):",
    ...input.existing.map((name) => `- ${name}`),
    "",
    "Reutilizá siempre que se pueda; solo inventá una si ninguna abarca el",
    "gasto. Nueva = 1 o 2 palabras en español, singular, mayúscula inicial.",
    "icon_key: el icono que mejor la represente, de la lista permitida.",
  ].join("\n");
}

function parse(label: string, text: unknown): VoiceDraft | null {
  if (typeof text !== "string") {
    logFailure(`${label} respondió sin texto`);
    return null;
  }

  try {
    const parsed = JSON.parse(text);

    const amount = Math.abs(Number(parsed?.amount));
    const description = String(parsed?.description ?? "")
      .trim()
      .slice(0, 60);

    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (description.length < 2) return null;

    const currency = String(parsed?.currency ?? "")
      .trim()
      .toUpperCase();
    const date = String(parsed?.date ?? "").slice(0, 10);

    return {
      description,
      amount,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      category: String(parsed?.category ?? "")
        .trim()
        .slice(0, 40),
      iconKey:
        typeof parsed?.icon_key === "string" &&
        (ICON_KEYS as readonly string[]).includes(parsed.icon_key)
          ? parsed.icon_key
          : "other",
    };
  } catch {
    logFailure(`${label} devolvió JSON inválido`, text);
    return null;
  }
}

async function askGemini(model: string, transcript: string, input: VoiceInput) {
  const apiKey = process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
  if (!apiKey) return null;

  const label = `gemini/${model}`;
  const outcome = await postJson(
    label,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": apiKey },
    JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: buildPrompt(transcript, input) }] },
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
  return parse(label, payload?.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function askGroq(model: string, transcript: string, input: VoiceInput) {
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
      messages: [{ role: "user", content: buildPrompt(transcript, input) }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "voice_expense", strict: true, schema: GROQ_SCHEMA },
      },
    })
  );

  if (!outcome.ok) return null;

  const payload = outcome.payload as {
    choices?: { message?: { content?: string } }[];
  };
  return parse(label, payload?.choices?.[0]?.message?.content);
}

/* -------------------------------------------------------------------------- */

/**
 * Oye y entiende.
 *
 * `unheard` es que no se entendió nada de audio —silencio, ruido, el micro
 * tapado— y `unclear` es que sí se escuchó pero eso no era un gasto. Se
 * distinguen porque la salida es distinta: en el segundo caso se le puede
 * mostrar a la persona exactamente qué se le entendió, que suele explicar
 * todo solo.
 */
export async function readSpokenExpense(
  input: VoiceInput
): Promise<VoiceResult> {
  if (!groq.isConfigured()) return { ok: false, kind: "no_key" };

  const transcript = await transcribe(input.audio);
  if (!transcript) return { ok: false, kind: "unheard" };

  if (gemini.isConfigured()) {
    for (const model of gemini.models()) {
      const draft = await askGemini(model, transcript, input);
      if (draft) return { ok: true, transcript, draft };
    }
  }

  for (const model of groq.models()) {
    const draft = await askGroq(model, transcript, input);
    if (draft) return { ok: true, transcript, draft };
  }

  return { ok: false, kind: "unclear", transcript };
}
