import type { PurchaseType, Verdict } from "@/lib/money";

export type DecisionRecord = {
  id: string;
  query: string;
  product_name: string;
  price: number;
  currency: string;
  price_is_estimated: boolean;
  category: string | null;
  purchase_type: PurchaseType | null;
  size_bucket: "small" | "medium" | "large" | null;
  hours_cost: number;
  work_days_cost: number;
  income_share: number;
  hourly_rate_snap: number;
  verdict: Verdict;
  ai_opinion: string | null;
  ai_model: string | null;
  created_at: string;
};

/**
 * Veredicto de respaldo cuando la IA no responde: solo mira qué tajada
 * del ingreso mensual se lleva la compra.
 */
export function fallbackVerdict(incomeShare: number): Verdict {
  if (incomeShare >= 0.35) return "skip";
  if (incomeShare >= 0.12) return "think";
  return "buy";
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
