import type { PurchaseType, Verdict } from "@/lib/money";

export type AnalysisFailure =
  | "no_key"
  | "quota"
  | "overloaded"
  | "timeout"
  | "bad_response"
  | "network";

export type PurchaseAnalysis = {
  product_name: string;
  estimated_price: number;
  price_is_estimated: boolean;
  category: string;
  purchase_type: PurchaseType;
  verdict: Verdict;
  opinion: string;
  pros: string[];
  cons: string[];
};

export type AnalysisResult =
  | { ok: true; data: PurchaseAnalysis; model: string }
  | { ok: false; kind: AnalysisFailure };

export type AnalyzeInput = {
  query: string;
  knownPrice: number | null;
  /** Horas ya calculadas por nosotros, cuando el precio se conoce. */
  knownHours: number | null;
  currency: string;
  monthlyIncome: number;
  hourlyRate: number;
  hoursPerDay: number;
  daysPerWeek: number;
};

/**
 * Un proveedor de análisis. Se prueban en orden; dentro de cada uno, sus
 * modelos. Solo la falta de cuota o la saturación justifican pasar al
 * siguiente modelo del mismo proveedor.
 */
export type Provider = {
  name: string;
  isConfigured: () => boolean;
  models: () => string[];
  analyze: (model: string, input: AnalyzeInput) => Promise<AnalysisResult>;
};

/**
 * Fallas que ameritan probar con otro modelo. `bad_response` entra porque es
 * un desliz de muestreo: el modelo se salió del esquema en esta pasada, y otro
 * suele cumplirlo. Solo `network`, `timeout` y `no_key` son definitivas.
 */
export function shouldFailOver(kind: AnalysisFailure) {
  return kind === "quota" || kind === "overloaded" || kind === "bad_response";
}

/** Se registra solo cuando algo falla: el camino feliz no ensucia los logs. */
export function logFailure(reason: string, detail?: string) {
  console.error(
    `[should-i-buy-it] ${reason}`,
    detail ? detail.slice(0, 300) : ""
  );
}
