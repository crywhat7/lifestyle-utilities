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

/* -------------------------------------------------------------------------- */
/* Recurrencia                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cada cuánto vuelve algo.
 *
 * `freq` decide qué campos mandan y cuáles son ruido:
 *
 *   monthly_day     — `day_of_month`. El 15, el 30, el último día del mes.
 *   weekly          — `weekday`. Todos los miércoles, sin importar la fecha.
 *   monthly_weekday — `weekday` + `week_ordinal`. El primer sábado, el último
 *                     viernes. Positivo cuenta desde el inicio del mes;
 *                     negativo, desde el final.
 */
export type Freq = "monthly_day" | "weekly" | "monthly_weekday";

export type Recurrence = {
  freq: Freq;
  day_of_month: number | null;
  /** 0 = domingo, como `Date.getDay()`. */
  weekday: number | null;
  /** 1..4 desde el inicio, -1 último, -2 penúltimo. */
  week_ordinal: number | null;
};

export type PaySchedule = Recurrence & {
  id: string;
  label: string;
  amount: number;
  currency: string;
  active: boolean;
};

export type FixedExpense = Recurrence & {
  id: string;
  name: string;
  /** Piso del rango contemplado. Sin `amount_max`, es el monto exacto. */
  amount: number;
  amount_max: number | null;
  currency: string;
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

/* -------------------------------------------------------------------------- */
/* El motor: cuándo cae una regla                                              */
/* -------------------------------------------------------------------------- */

const WEEKDAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const ORDINAL_NAMES: Record<number, string> = {
  1: "primer",
  2: "segundo",
  3: "tercer",
  4: "cuarto",
  [-1]: "último",
  [-2]: "penúltimo",
};

export const WEEKDAY_OPTIONS = WEEKDAY_NAMES.map((name, value) => ({
  value,
  label: name[0].toUpperCase() + name.slice(1),
}));

export const ORDINAL_OPTIONS = [1, 2, 3, 4, -1, -2].map((value) => ({
  value,
  label: ORDINAL_NAMES[value][0].toUpperCase() + ORDINAL_NAMES[value].slice(1),
}));

/** Una regla sin los datos que su frecuencia exige no cae nunca. */
export function hasSchedule(rule: Recurrence) {
  if (rule.freq === "weekly") return rule.weekday != null;
  if (rule.freq === "monthly_weekday") {
    return rule.weekday != null && rule.week_ordinal != null;
  }
  return rule.day_of_month != null;
}

/**
 * ¿Esta regla cae este día?
 *
 * Es la única definición de "cae hoy" que existe en la app: la usa la agenda
 * de la pantalla, el cron del salario y el del recordatorio. Si alguna vez
 * hay que discutir si un pago tocaba o no, se discute acá y nada más.
 */
export function occursOn(rule: Recurrence, date: Date): boolean {
  if (!hasSchedule(rule)) return false;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (rule.freq === "weekly") return date.getDay() === rule.weekday;

  if (rule.freq === "monthly_weekday") {
    if (date.getDay() !== rule.weekday) return false;

    const ordinal = rule.week_ordinal as number;
    if (ordinal > 0) return Math.ceil(day / 7) === ordinal;

    // Negativo: contar desde el final. El último viernes es el que no tiene
    // otro viernes después en el mismo mes.
    const last = daysInMonth(year, month);
    return Math.ceil((last - day + 1) / 7) === -ordinal;
  }

  // El 31 en un mes de 30 cae el último día que sí existe.
  return day === clampDay(rule.day_of_month as number, year, month);
}

/** Dos meses alcanzan para cualquiera de las tres frecuencias. */
const HORIZON_DAYS = 70;

function shiftDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** La próxima vez que cae, mirando hacia adelante. */
export function nextOccurrence(
  rule: Recurrence,
  from = new Date(),
  includeToday = true
): Date | null {
  if (!hasSchedule(rule)) return null;

  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let offset = includeToday ? 0 : 1; offset <= HORIZON_DAYS; offset++) {
    const candidate = shiftDays(base, offset);
    if (occursOn(rule, candidate)) return candidate;
  }

  return null;
}

/** La última vez que cayó, mirando hacia atrás. */
export function previousOccurrence(
  rule: Recurrence,
  from = new Date(),
  includeToday = true
): Date | null {
  if (!hasSchedule(rule)) return null;

  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let offset = includeToday ? 0 : 1; offset <= HORIZON_DAYS; offset++) {
    const candidate = shiftDays(base, -offset);
    if (occursOn(rule, candidate)) return candidate;
  }

  return null;
}

/** Cómo se lee la regla en una línea: "Cada miércoles", "El último viernes". */
export function recurrenceLabel(rule: Recurrence) {
  if (rule.freq === "weekly") {
    return rule.weekday == null
      ? "Sin día"
      : `Cada ${WEEKDAY_NAMES[rule.weekday]}`;
  }

  if (rule.freq === "monthly_weekday") {
    if (rule.weekday == null || rule.week_ordinal == null) return "Sin día";
    return `El ${ORDINAL_NAMES[rule.week_ordinal]} ${WEEKDAY_NAMES[rule.weekday]}`;
  }

  return rule.day_of_month == null ? "Sin día fijo" : `Cada ${rule.day_of_month}`;
}

/** Lo que se dibuja en el círculo de la lista: "15", "MIÉ", "1er SÁB". */
export function recurrenceBadge(rule: Recurrence) {
  if (rule.freq === "weekly") {
    return rule.weekday == null
      ? "—"
      : WEEKDAY_NAMES[rule.weekday].slice(0, 3).toUpperCase();
  }

  if (rule.freq === "monthly_weekday") {
    if (rule.weekday == null || rule.week_ordinal == null) return "—";
    const mark = rule.week_ordinal < 0 ? `U${-rule.week_ordinal}` : `${rule.week_ordinal}º`;
    return `${mark} ${WEEKDAY_NAMES[rule.weekday].slice(0, 3).toUpperCase()}`;
  }

  return rule.day_of_month == null ? "—" : String(rule.day_of_month);
}

/* -------------------------------------------------------------------------- */
/* Pagos                                                                       */
/* -------------------------------------------------------------------------- */

export type Payday = {
  schedule: PaySchedule;
  date: Date;
  daysAway: number;
};

/** El pago activo más cercano, contando hoy como válido. */
export function nextPayday(
  schedules: PaySchedule[],
  today = new Date()
): Payday | null {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const candidates = schedules
    .filter((schedule) => schedule.active)
    .map((schedule) => {
      const date = nextOccurrence(schedule, base, true);
      if (!date) return null;

      return {
        schedule,
        date,
        daysAway: Math.round((date.getTime() - base.getTime()) / 86_400_000),
      };
    })
    .filter((candidate): candidate is Payday => candidate !== null)
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

/* -------------------------------------------------------------------------- */
/* Gastos contemplados — cuándo toca el próximo                                */
/* -------------------------------------------------------------------------- */

export type FixedDue = {
  expense: FixedExpense;
  /** El vencimiento vigente: el que pasó si nadie lo registró, el siguiente si sí. */
  date: Date;
  /** Negativo = ya se pasó la fecha y nadie lo registró. */
  daysAway: number;
  paid: boolean;
};

/**
 * La agenda de lo que se repite.
 *
 * Cada gasto se mira contra SU período, no contra el mes del calendario: eso
 * es lo que deja convivir la renta del 5 con el alquiler de todos los sábados.
 * La pregunta es siempre la misma — desde la última vez que tocó, ¿se
 * registró algo? Si sí, el gasto rueda al siguiente y deja de ser una deuda.
 * Si no, se queda clavado en la fecha que pasó, y ese `daysAway` negativo es
 * justamente la alarma.
 *
 * `paidAt` trae, por gasto, la fecha del último registro suyo. Basta con la
 * última: un pago anterior al vencimiento vigente no lo cubre.
 *
 * `since` es la frontera del seguimiento: el día en que esta persona montó su
 * sistema acá. Un vencimiento anterior a esa fecha no está atrasado, está
 * fuera de alcance — se pagó (o no) antes de que la app existiera, y gritarle
 * "atrasado la renta" a alguien que acaba de crear su cuenta es mentirle.
 */
export function fixedDues(
  expenses: FixedExpense[],
  paidAt: Map<string, string> = new Map(),
  today = new Date(),
  since: Date | null = null
): FixedDue[] {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const floor = since ? isoDate(since) : null;

  return expenses
    .filter((expense) => expense.active && hasSchedule(expense))
    .map((expense) => {
      const previous = previousOccurrence(expense, base, true);
      const upcoming = nextOccurrence(expense, base, false);
      const last = paidAt.get(expense.id) ?? null;

      // El vencimiento vigente es el que ya pasó, salvo que quede fuera del
      // seguimiento: entonces el que cuenta es el siguiente.
      const current =
        previous && (!floor || isoDate(previous) >= floor) ? previous : null;

      const covered = Boolean(current && last && last >= isoDate(current));
      const date = current && !covered ? current : upcoming;

      if (!date) return null;

      return {
        expense,
        date,
        daysAway: Math.round((date.getTime() - base.getTime()) / 86_400_000),
        paid: covered,
      };
    })
    .filter((due): due is FixedDue => due !== null)
    .sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return a.date.getTime() - b.date.getTime();
    });
}

/**
 * Lo que un gasto contemplado se va a llevar.
 *
 * Con rango se toma el techo, no el promedio: para saber si el saldo alcanza,
 * la cifra útil es la peor, no la cómoda.
 */
export function committedAmount(expense: FixedExpense) {
  return expense.amount_max ?? expense.amount;
}

/** ¿Este gasto se mueve dentro de un rango, o siempre cae igual? */
export function hasRange(expense: FixedExpense) {
  return expense.amount_max != null && expense.amount_max > expense.amount;
}

/** Una fecha ISO corta a `Date` local, sin que UTC corra el día. */
export function fromIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Suma por moneda. Un gasto en dólares y otro en quetzales no se pueden sumar
 * en un solo número, y mentir con un total falso es peor que mostrar dos.
 */
export function sumByCurrency(
  rows: { amount: number; currency: string }[]
): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  }

  return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

/** Cómo se lee una fecha que ya pasó, hoy, mañana o dentro de unos días. */
export function dueLabel(days: number) {
  if (days < -1) return `atrasado ${Math.abs(days)} días`;
  if (days === -1) return "atrasado 1 día";
  if (days === 0) return "vence hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/* -------------------------------------------------------------------------- */
/* Movimientos pendientes de clasificar                                        */
/* -------------------------------------------------------------------------- */

/**
 * Texto comparable: sin tildes, sin mayúsculas y sin espacios de más.
 *
 * Los bancos escriben "COMPRA  EN PROCESO", "Transacción en proceso" y
 * "compra en proceso" para exactamente lo mismo. Normalizar los dos lados es
 * lo que evita tener que cargar las tres variantes en la tabla de frases.
 */
export function normalizePhrase(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Este movimiento sigue con el nombre provisional del banco?
 *
 * Alcanza con que la descripción CONTENGA la frase: el banco casi siempre le
 * pega algo alrededor ("COMPRA EN PROCESO 4821"), y exigir coincidencia
 * exacta dejaría fuera justo los casos para los que existe la lista.
 *
 * `phrases` llega ya normalizada — normalizar la lista entera en cada fila de
 * una lista de cuarenta sería trabajo repetido cuarenta veces.
 */
export function isPendingLabel(description: string, phrases: string[]) {
  if (phrases.length === 0) return false;

  const text = normalizePhrase(description);
  return phrases.some((phrase) => phrase.length > 0 && text.includes(phrase));
}
