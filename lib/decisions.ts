import type { PurchaseType, Verdict } from "@/lib/money";

export type AiStatus = "pending" | "ready" | "failed";

export type DecisionRecord = {
  id: string;
  query: string;
  product_name: string;
  /** Precio ya convertido a la moneda del perfil. */
  price: number | null;
  currency: string;
  /** Precio tal como se escribió, en la moneda de la compra. */
  price_original: number | null;
  purchase_currency: string | null;
  fx_rate: number | null;
  price_is_estimated: boolean;
  category: string | null;
  purchase_type: PurchaseType | null;
  size_bucket: "small" | "medium" | "large" | null;
  hours_cost: number | null;
  work_days_cost: number | null;
  income_share: number | null;
  hourly_rate_snap: number;
  verdict: Verdict | null;
  ai_status: AiStatus;
  ai_error: string | null;
  ai_opinion: string | null;
  ai_model: string | null;
  pros: string[] | null;
  cons: string[] | null;
  created_at: string;
};

/**
 * Veredicto de respaldo, y el que se muestra al instante mientras la IA
 * todavía no contesta: solo mira qué tajada del ingreso mensual se lleva.
 */
export function fallbackVerdict(incomeShare: number): Verdict {
  if (incomeShare >= 0.35) return "skip";
  if (incomeShare >= 0.12) return "think";
  return "buy";
}

export function sizeBucket(
  incomeShare: number
): "small" | "medium" | "large" {
  if (incomeShare < 0.05) return "small";
  if (incomeShare < 0.25) return "medium";
  return "large";
}

export function relativeDate(iso: string) {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);

  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  return new Date(iso).toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
  });
}
