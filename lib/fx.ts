import "server-only";
import { log } from "@/lib/log";

const ENDPOINT = "https://open.er-api.com/v6/latest";

export type Conversion = {
  amount: number;
  rate: number;
};

/**
 * Convierte a la moneda del perfil. Las tasas se cachean 6 horas: para decidir
 * si una compra vale la pena, el tipo de cambio del minuto no cambia nada.
 */
/**
 * Convierte, y si el tipo de cambio no llegó lo deja anotado: un monto que
 * se guardó sin convertir se explica con este evento.
 */
export async function convert(amount: number, from: string, to: string): Promise<Conversion | null> {
  const result = await fetchRate(amount, from, to);
  if (!result) log({ level: "warn", source: "fx", event: "fx.unavailable", message: `Sin tipo de cambio ${from} → ${to}`, detail: { amount, from, to } });
  return result;
}

async function fetchRate(
  amount: number,
  from: string,
  to: string
): Promise<Conversion | null> {
  if (from === to) return { amount, rate: 1 };

  try {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(from)}`, {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    if (payload?.result !== "success") return null;

    const rate = payload?.rates?.[to];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    return { amount: amount * rate, rate };
  } catch {
    return null;
  }
}
