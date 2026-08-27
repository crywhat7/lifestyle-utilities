import { parseAnalysis, postJson } from "./http";
import {
  PURCHASE_TYPES,
  REQUIRED_FIELDS,
  VERDICTS,
  buildPrompt,
} from "./prompt";
import type { AnalysisResult, AnalyzeInput, Provider } from "./types";

/**
 * El free tier de Gemini limita por modelo y por día (gemini-2.5-flash: 20
 * peticiones diarias), así que hay cascada de modelos antes de cambiar de
 * proveedor. SHOULD_I_BUY_IT_GEMINI_MODEL fuerza uno en particular.
 */
const DEFAULT_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];

/** Gemini usa el dialecto de esquema de OpenAPI: tipos en mayúsculas. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    product_name: { type: "STRING" },
    estimated_price: { type: "NUMBER" },
    price_is_estimated: { type: "BOOLEAN" },
    category: { type: "STRING" },
    purchase_type: { type: "STRING", enum: PURCHASE_TYPES },
    verdict: { type: "STRING", enum: VERDICTS },
    opinion: { type: "STRING" },
    pros: { type: "ARRAY", items: { type: "STRING" } },
    cons: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: REQUIRED_FIELDS,
};

export const gemini: Provider = {
  name: "gemini",

  isConfigured: () => Boolean(process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY),

  models() {
    const forced = process.env.SHOULD_I_BUY_IT_GEMINI_MODEL?.trim();
    return forced ? [forced] : DEFAULT_MODELS;
  },

  async analyze(model: string, input: AnalyzeInput): Promise<AnalysisResult> {
    const apiKey = process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
    if (!apiKey) return { ok: false, kind: "no_key" };

    const label = `gemini/${model}`;
    const outcome = await postJson(
      label,
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": apiKey },
      JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      })
    );

    if (!outcome.ok) return outcome;

    const payload = outcome.payload as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const data = parseAnalysis(
      label,
      payload?.candidates?.[0]?.content?.parts?.[0]?.text
    );

    if (!data) return { ok: false, kind: "bad_response" };
    return { ok: true, data, model: label };
  },
};
