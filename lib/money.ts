export const WEEKS_PER_MONTH = 4.345;

export type WorkProfile = {
  monthly_income: number;
  hours_per_day: number;
  days_per_week: number;
  currency: string;
  hourly_rate: number;
};

export type Verdict = "buy" | "think" | "skip";

export type Risk = "low" | "medium" | "high";

export type PurchaseType = "necesidad" | "inversion" | "antojo" | "impulso";

/**
 * Colores en hexadecimal, no en var(): se les concatena alfa (`${color}55`)
 * para halos y bordes, y `var(--x)55` es CSS inválido.
 */
export const VERDICT_COPY: Record<
  Verdict,
  { label: string; color: string; note: string }
> = {
  buy: {
    label: "Compralo",
    color: "var(--accent-ink)",
    note: "El tiempo que cuesta es proporcional a lo que te devuelve.",
  },
  think: {
    label: "Pensalo",
    color: "var(--warn)",
    note: "Dormí una noche. Si mañana lo seguís queriendo, es real.",
  },
  skip: {
    label: "Dejalo pasar",
    color: "var(--danger)",
    note: "Ese precio te cuesta más vida de la que vale el objeto.",
  },
};

/** Arriba del 35% del ingreso ya no es una advertencia: es una decisión seria. */
export const HIGH_RISK = {
  label: "Alto riesgo",
  color: "var(--alert)",
  note: "Esto se lleva más de un tercio de tu mes. No lo decidas hoy.",
};

export function riskLevel(incomeShare: number): Risk {
  if (incomeShare >= 0.35) return "high";
  if (incomeShare >= 0.12) return "medium";
  return "low";
}

/** El riesgo manda sobre el veredicto: la plata real pesa más que la opinión. */
export function presentation(verdict: Verdict, risk: Risk) {
  if (risk === "high") return HIGH_RISK;
  return VERDICT_COPY[verdict];
}

export const TYPE_LABEL: Record<PurchaseType, string> = {
  necesidad: "Necesidad",
  inversion: "Inversión",
  antojo: "Antojo",
  impulso: "Impulso",
};

export const SIZE_LABEL: Record<string, string> = {
  small: "Compra chica",
  medium: "Compra media",
  large: "Compra grande",
};

export function monthlyHours(profile: {
  hours_per_day: number;
  days_per_week: number;
}) {
  return profile.hours_per_day * profile.days_per_week * WEEKS_PER_MONTH;
}

export function hourlyRate(profile: {
  monthly_income: number;
  hours_per_day: number;
  days_per_week: number;
}) {
  return profile.monthly_income / monthlyHours(profile);
}

export type TimeCost = {
  hours: number;
  workDays: number;
  incomeShare: number;
};

export function timeCost(price: number, profile: WorkProfile): TimeCost {
  const rate = profile.hourly_rate || hourlyRate(profile);
  const hours = rate > 0 ? price / rate : 0;

  return {
    hours,
    workDays: profile.hours_per_day > 0 ? hours / profile.hours_per_day : 0,
    incomeShare:
      profile.monthly_income > 0 ? price / profile.monthly_income : 0,
  };
}

/**
 * Pasando las 24 horas, "104h 17m" no se puede pensar. Se parte en jornadas
 * reales de la persona: 8h/día ⇒ 104h son 13 días de trabajo.
 */
export function formatWorkTime(hours: number, hoursPerDay: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "0m";

  if (hours < 1) return `${Math.round(hours * 60)}m`;

  if (hours < 24) {
    const whole = Math.floor(hours);
    const minutes = Math.round((hours - whole) * 60);
    if (minutes === 60) return `${whole + 1}h`;
    if (minutes === 0) return `${whole}h`;
    return `${whole}h ${minutes}m`;
  }

  const perDay = hoursPerDay > 0 ? hoursPerDay : 8;
  const days = Math.floor(hours / perDay);
  const rest = Math.round(hours - days * perDay);

  if (days >= 1000) return `${days.toLocaleString("es-GT")}d`;
  if (rest <= 0) return `${days}d`;
  return `${days}d ${rest}h`;
}

/** El total crudo, para no perder la cifra real bajo la traducción. */
export function formatHours(hours: number) {
  const rounded = Math.round(hours);
  return `${rounded.toLocaleString("es-GT")} ${rounded === 1 ? "hora" : "horas"}`;
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Centroamérica primero, luego el resto de la región y las divisas fuertes. */
export const CURRENCIES = [
  { code: "HNL", label: "L · Lempira" },
  { code: "GTQ", label: "Q · Quetzal" },
  { code: "CRC", label: "₡ · Colón" },
  { code: "NIO", label: "C$ · Córdoba" },
  { code: "PAB", label: "B/. · Balboa" },
  { code: "BZD", label: "BZ$ · Dólar beliceño" },
  { code: "USD", label: "$ · Dólar" },
  { code: "EUR", label: "€ · Euro" },
  { code: "MXN", label: "$ · Peso mexicano" },
  { code: "COP", label: "$ · Peso colombiano" },
  { code: "ARS", label: "$ · Peso argentino" },
] as const;

export const DEFAULT_CURRENCY = "HNL";

export const CURRENCY_CODES = CURRENCIES.map((currency) => currency.code);
