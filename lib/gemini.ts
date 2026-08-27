import "server-only";
import type { PurchaseType, Verdict } from "@/lib/money";

export const GEMINI_MODEL = "gemini-2.5-flash";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type PurchaseAnalysis = {
  product_name: string;
  estimated_price: number;
  price_is_estimated: boolean;
  category: string;
  purchase_type: PurchaseType;
  size_bucket: "small" | "medium" | "large";
  verdict: Verdict;
  opinion: string;
};

type AnalyzeInput = {
  query: string;
  knownPrice: number | null;
  currency: string;
  monthlyIncome: number;
  hourlyRate: number;
  hoursPerDay: number;
  daysPerWeek: number;
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    product_name: { type: "STRING" },
    estimated_price: { type: "NUMBER" },
    price_is_estimated: { type: "BOOLEAN" },
    category: { type: "STRING" },
    purchase_type: {
      type: "STRING",
      enum: ["necesidad", "inversion", "antojo", "impulso"],
    },
    size_bucket: { type: "STRING", enum: ["small", "medium", "large"] },
    verdict: { type: "STRING", enum: ["buy", "think", "skip"] },
    opinion: { type: "STRING" },
  },
  required: [
    "product_name",
    "estimated_price",
    "price_is_estimated",
    "category",
    "purchase_type",
    "size_bucket",
    "verdict",
    "opinion",
  ],
} as const;

/**
 * Le pide a Gemini que normalice el producto, estime el precio si no lo sabemos,
 * lo clasifique y dé una opinión corta. Los números que se muestran en pantalla
 * se recalculan localmente: acá la IA aporta criterio, no aritmética.
 */
export async function analyzePurchase(
  input: AnalyzeInput
): Promise<PurchaseAnalysis | null> {
  const apiKey = process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
  if (!apiKey) return null;

  const priceLine =
    input.knownPrice != null
      ? `El precio real es ${input.knownPrice} ${input.currency}. Usalo tal cual y marcá price_is_estimated en false.`
      : `No se sabe el precio. Estimá el precio de venta típico en ${input.currency} y marcá price_is_estimated en true.`;

  const prompt = [
    "Sos el motor de criterio de una herramienta que traduce precios a horas de vida.",
    "",
    "Contexto de la persona:",
    `- Ingreso mensual: ${input.monthlyIncome} ${input.currency}`,
    `- Trabaja ${input.hoursPerDay} horas al día, ${input.daysPerWeek} días a la semana`,
    `- Una hora de su trabajo vale ${input.hourlyRate.toFixed(2)} ${input.currency}`,
    "",
    `Quiere comprar: "${input.query}"`,
    priceLine,
    "",
    "Devolvé:",
    "- product_name: el producto normalizado y corto (máx 5 palabras).",
    "- category: categoría en español, 1 o 2 palabras (ej. Tecnología, Comida, Ropa, Hogar, Salud).",
    "- purchase_type: necesidad, inversion, antojo o impulso.",
    "- size_bucket: small para gastos chicos como una cena, medium para gasto notorio, large para una compra grande.",
    "- verdict: buy si claramente vale las horas, think si amerita dudarlo, skip si el costo en vida no se justifica.",
    "- opinion: máximo 2 frases, en español con voseo (vos/tenés/podés/comprá), directa y concreta.",
    "  Mencioná el costo en tiempo cuando ayude. Nada de moralina ni de frases genéricas.",
  ].join("\n");

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;

    const parsed = JSON.parse(text) as PurchaseAnalysis;
    if (!Number.isFinite(parsed.estimated_price)) return null;

    return parsed;
  } catch {
    return null;
  }
}
