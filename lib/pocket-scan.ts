/**
 * Egresos leídos de una captura — tipos y reglas de duplicado.
 *
 * Nada de esto toca la red ni la base: son las reglas que comparten el
 * servidor (que las aplica antes de insertar) y la pantalla de revisión
 * (que las muestra para que la persona decida).
 */

export type ScanStatus = "posted" | "pending";

/** Una fila leída de la imagen, ya normalizada y contrastada con lo guardado. */
export type ScannedExpense = {
  /** Identidad dentro de la tanda: es lo que viaja en el formulario. */
  key: string;
  description: string;
  amount: number;
  currency: string;
  occurred_at: string;
  status: ScanStatus;
  /** Referencia del banco, cuando la captura la muestra. */
  reference: string | null;
  /** Categoría existente que le tocó, o null si hay que crearla al confirmar. */
  categoryId: string | null;
  categoryName: string;
  iconKey: string;
  /** Por qué esto podría ya estar registrado. Null = no se parece a nada. */
  duplicate: DuplicateHint | null;
};

export type DuplicateHint = {
  reason: "reference" | "amount";
  label: string;
};

/** Lo mínimo de un movimiento guardado para poder compararlo. */
export type ExistingExpense = {
  description: string;
  amount: number;
  currency: string;
  occurred_at: string;
  external_ref: string | null;
};

/** Cuántos días alrededor cuentan como "es el mismo cargo, otra fecha". */
export const DUPLICATE_WINDOW_DAYS = 3;

/** Los centavos mandan: 120.00 y 120.001 son el mismo cargo. */
function sameAmount(a: number, b: number) {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function normalizeRef(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\s\-.]/g, "").toUpperCase();
  // Menos de cuatro caracteres no identifica nada: un "1" no es referencia.
  return clean.length >= 4 ? clean.slice(0, 60) : null;
}

function daysBetween(a: string, b: string) {
  const left = Date.parse(`${a}T12:00:00Z`);
  const right = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Infinity;
  return Math.abs(Math.round((left - right) / 86_400_000));
}

function shortDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-GT", { day: "numeric", month: "short" });
}

/**
 * ¿Esto ya está registrado?
 *
 * La referencia es prueba: si coincide, es literalmente el mismo cargo y no
 * hay nada que discutir. El monto es apenas una sospecha — dos cafés iguales
 * en la misma semana existen — así que se avisa con la fecha del otro para
 * que la persona reconozca cuál es cuál, pero nunca se decide por ella.
 */
export function findDuplicate(
  candidate: {
    amount: number;
    currency: string;
    occurred_at: string;
    reference: string | null;
  },
  existing: ExistingExpense[]
): DuplicateHint | null {
  const ref = normalizeRef(candidate.reference);

  if (ref) {
    const hit = existing.find((row) => normalizeRef(row.external_ref) === ref);
    if (hit) {
      return {
        reason: "reference",
        label: `Ya registrado el ${shortDate(hit.occurred_at)}`,
      };
    }
  }

  const near = existing.find(
    (row) =>
      sameAmount(row.amount, candidate.amount) &&
      row.currency === candidate.currency &&
      daysBetween(row.occurred_at, candidate.occurred_at) <=
        DUPLICATE_WINDOW_DAYS
  );

  if (near) {
    return {
      reason: "amount",
      label: `Mismo monto el ${shortDate(near.occurred_at)}`,
    };
  }

  return null;
}

/**
 * La misma fila leída dos veces.
 *
 * Pasa cuando la captura repite el movimiento (pendiente arriba, aplicado
 * abajo) o cuando el recorte agarra una fila partida. Gana la primera.
 */
export function dedupeBatch<
  T extends {
    description: string;
    amount: number;
    currency: string;
    occurred_at: string;
    reference: string | null;
  },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const row of rows) {
    const ref = normalizeRef(row.reference);
    const key =
      ref ??
      [
        row.description.trim().toLowerCase(),
        Math.round(row.amount * 100),
        row.currency,
        row.occurred_at,
      ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}
