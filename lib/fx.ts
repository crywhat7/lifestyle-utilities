import "server-only";

const ENDPOINT = "https://open.er-api.com/v6/latest";

export type Conversion = {
  amount: number;
  rate: number;
};

/**
 * Convierte a la moneda del perfil. Las tasas se cachean 6 horas: para decidir
 * si una compra vale la pena, el tipo de cambio del minuto no cambia nada.
 */
export async function convert(
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
