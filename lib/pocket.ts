/**
 * My Pocket — tipos y aritmética de fechas.
 *
 * Nada de esto toca la red ni la base: son las reglas que comparten el
 * servidor y el cliente para hablar del mismo mes y del mismo saldo.
 */

export type CategoryKind = "income" | "expense" | "both";

export type PocketCategory = {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  icon_key: string;
  kind: CategoryKind;
  is_ai: boolean;
};

export type TransactionKind = "income" | "expense";

export type PocketTransaction = {
  id: string;
  kind: TransactionKind;
  description: string;
  amount: number;
  currency: string;
  amount_base: number;
  base_currency: string;
  fx_rate: number;
  category_id: string | null;
  source: "manual" | "fixed" | "salary";
  ai_categorized: boolean;
  occurred_at: string;
  created_at: string;
};

export type PaySchedule = {
  id: string;
  label: string;
  day_of_month: number;
  amount: number;
  currency: string;
  active: boolean;
};

export type FixedExpense = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  day_of_month: number | null;
  category_id: string | null;
  active: boolean;
};

/** Slug sin tildes ni signos: es la llave de deduplicación de categorías. */
export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Fecha local en formato ISO corto, sin que UTC corra el día. */
export function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** El 31 en febrero no existe: se cobra el último día que sí existe. */
export function clampDay(day: number, year: number, month: number) {
  return Math.min(day, daysInMonth(year, month));
}

export function monthStart(date = new Date()) {
  return isoDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function monthLabel(date = new Date()) {
  return date.toLocaleDateString("es-GT", { month: "long", year: "numeric" });
}

export type Payday = {
  schedule: PaySchedule;
  date: Date;
  daysAway: number;
};

/**
 * El pago activo más cercano hacia adelante. Si el día de este mes ya pasó,
 * se busca en el siguiente.
 */
export function nextPayday(
  schedules: PaySchedule[],
  today = new Date()
): Payday | null {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const candidates = schedules
    .filter((schedule) => schedule.active)
    .map((schedule) => {
      let year = base.getFullYear();
      let month = base.getMonth();
      let date = new Date(
        year,
        month,
        clampDay(schedule.day_of_month, year, month)
      );

      if (date < base) {
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
        date = new Date(
          year,
          month,
          clampDay(schedule.day_of_month, year, month)
        );
      }

      return {
        schedule,
        date,
        daysAway: Math.round((date.getTime() - base.getTime()) / 86_400_000),
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return candidates[0] ?? null;
}

export function daysAwayLabel(days: number) {
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

export function dayLabel(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000
  );

  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString("es-GT", { weekday: "long" });
  }
  return date.toLocaleDateString("es-GT", { day: "numeric", month: "short" });
}

/** El signo se dibuja aparte del número: la cifra manda, el signo la matiza. */
export function signOf(kind: TransactionKind) {
  return kind === "income" ? "+" : "−";
}

export type Totals = { income: number; expense: number; balance: number };

export function totals(
  rows: { kind: TransactionKind; amount_base: number }[]
): Totals {
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    const amount = Number(row.amount_base) || 0;
    if (row.kind === "income") income += amount;
    else expense += amount;
  }

  return { income, expense, balance: income - expense };
}

/** Ordinal corto para los días de pago: "el 15", "el 30". */
export function ordinalDay(day: number) {
  return `el ${day}`;
}
