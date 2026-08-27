import { parseAnalysis, postJson } from "./http";
import {
  PURCHASE_TYPES,
  REQUIRED_FIELDS,
  VERDICTS,
  buildPrompt,
} from "./prompt";
import type { AnalysisResult, AnalyzeInput, Provider } from "./types";

/**
 * Respaldo cuando Gemini se queda sin cuota diaria o está saturado.
 * API compatible con OpenAI. SHOULD_I_BUY_IT_GROQ_MODEL fuerza uno.
 */
const DEFAULT_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"];

/** Groq usa JSON Schema estándar: tipos en minúsculas y additionalProperties. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    product_name: { type: "string" },
    estimated_price: { type: "number" },
    price_is_estimated: { type: "boolean" },
    category: { type: "string" },
    purchase_type: { type: "string", enum: PURCHASE_TYPES },
    verdict: { type: "string", enum: VERDICTS },
    opinion: { type: "string" },
    pros: { type: "array", items: { type: "string" } },
    cons: { type: "array", items: { type: "string" } },
  },
  required: REQUIRED_FIELDS,
  additionalProperties: false,
};

export const groq: Provider = {
  name: "groq",

  isConfigured: () => Boolean(process.env.GROQ_API_KEY),

  models() {
    const forced = process.env.SHOULD_I_BUY_IT_GROQ_MODEL?.trim();
    return forced ? [forced] : DEFAULT_MODELS;
  },

  async analyze(model: string, input: AnalyzeInput): Promise<AnalysisResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return { ok: false, kind: "no_key" };

    const label = `groq/${model}`;
    const outcome = await postJson(
      label,
      "https://api.groq.com/openai/v1/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      JSON.stringify({
        model,
        temperature: 0.6,
        messages: [{ role: "user", content: buildPrompt(input) }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "purchase_analysis",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      })
    );

    if (!outcome.ok) return outcome;

    const payload = outcome.payload as {
      choices?: { message?: { content?: string } }[];
    };
    const data = parseAnalysis(label, payload?.choices?.[0]?.message?.content);

    if (!data) return { ok: false, kind: "bad_response" };
    return { ok: true, data, model: label };
  },
};
