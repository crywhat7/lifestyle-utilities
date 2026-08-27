import "server-only";
import { gemini } from "./gemini";
import { groq } from "./groq";
import {
  shouldFailOver,
  type AnalysisFailure,
  type AnalysisResult,
  type AnalyzeInput,
  type Provider,
} from "./types";

export type {
  AnalysisFailure,
  AnalysisResult,
  AnalyzeInput,
  PurchaseAnalysis,
} from "./types";

/** Gemini primero por calidad; Groq de respaldo cuando aquel no está. */
const PROVIDERS: Provider[] = [gemini, groq];

/**
 * Normaliza el producto, estima el precio si no lo sabemos, lo clasifica y
 * arma pros, contras y recomendación. Los números que se muestran en pantalla
 * se recalculan localmente: acá la IA aporta criterio, no aritmética.
 *
 * Recorre proveedores y, dentro de cada uno, sus modelos. Solo la falta de
 * cuota o la saturación hacen saltar al siguiente modelo del mismo proveedor;
 * cualquier otra falla cambia de proveedor directamente.
 */
export async function analyzePurchase(
  input: AnalyzeInput
): Promise<AnalysisResult> {
  const available = PROVIDERS.filter((provider) => provider.isConfigured());

  if (available.length === 0) return { ok: false, kind: "no_key" };

  let lastFailure: AnalysisFailure = "network";

  for (const provider of available) {
    for (const model of provider.models()) {
      const outcome = await provider.analyze(model, input);

      if (outcome.ok) return outcome;

      lastFailure = outcome.kind;
      if (!shouldFailOver(outcome.kind)) break;
    }
  }

  return { ok: false, kind: lastFailure };
}
