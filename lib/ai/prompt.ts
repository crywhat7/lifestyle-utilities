import type { AnalyzeInput } from "./types";

/** Las cifras de tiempo las pone la app; la IA solo puede citarlas. */
function timeLine(input: AnalyzeInput) {
  if (input.knownHours == null) {
    return "Todavía no sabemos el precio final, así que NO menciones ninguna cifra de tiempo.";
  }

  const hours = Math.round(input.knownHours);
  const days = Math.round(input.knownHours / input.hoursPerDay);
  const share = Math.round(
    (input.knownHours * input.hourlyRate * 100) / input.monthlyIncome
  );

  return `Eso equivale a ${hours} horas de su trabajo, o sea ${days} días de jornada, y es el ${share}% de su ingreso mensual.`;
}

export function buildPrompt(input: AnalyzeInput) {
  const priceLine =
    input.knownPrice != null
      ? `El precio real es ${input.knownPrice} ${input.currency}. Usalo tal cual y marcá price_is_estimated en false.`
      : `No se sabe el precio. Estimá el precio de venta típico en ${input.currency} y marcá price_is_estimated en true.`;

  return [
    "Sos el motor de criterio de una herramienta que traduce precios a horas de vida.",
    "",
    "Contexto de la persona:",
    `- Ingreso mensual: ${input.monthlyIncome} ${input.currency}`,
    `- Trabaja ${input.hoursPerDay} horas al día, ${input.daysPerWeek} días a la semana`,
    `- Una hora de su trabajo vale ${input.hourlyRate.toFixed(2)} ${input.currency}`,
    "",
    `Quiere comprar: "${input.query}"`,
    priceLine,
    timeLine(input),
    "",
    "REGLA DURA: no hagas aritmética propia. La app ya calcula y muestra el costo",
    "en tiempo. Si citás una cifra de tiempo, tiene que ser exactamente una de las",
    "que te di arriba, con su unidad. Nunca inventes semanas, meses ni porcentajes.",
    "",
    "Respondé todo en español. Devolvé:",
    "- product_name: el producto normalizado y corto (máx 5 palabras).",
    "- category: categoría EN ESPAÑOL, 1 o 2 palabras (ej. Tecnología, Comida, Ropa, Hogar, Salud).",
    "- purchase_type: necesidad, inversion, antojo o impulso.",
    "- verdict: buy si claramente vale las horas, think si amerita dudarlo, skip si el costo en vida no se justifica.",
    "- opinion: NO es un resumen de los pros ni de los contras. Es el paso siguiente concreto:",
    "  qué hacer ahora mismo. Por ejemplo esperar una oferta puntual, comprar el modelo anterior,",
    "  ahorrar N semanas antes, partirlo en cuotas, o comprarlo ya si el momento es bueno.",
    "  Máximo 2 frases, con números cuando puedas, en voseo centroamericano (comprá, buscá, esperá).",
    "  Nada de muletillas rioplatenses como che, boludo o dale. Nada de moralina.",
    "- pros: 2 o 3 razones concretas para comprarlo, máximo 12 palabras cada una, con voseo.",
    "- cons: 2 o 3 razones concretas para no comprarlo, máximo 12 palabras cada una, con voseo.",
    "  Los pros y contras tienen que ser específicos de ESTE producto y de ESTE presupuesto,",
    "  no consejos genéricos de ahorro.",
  ].join("\n");
}

/** Campos que ambos proveedores deben devolver. */
export const REQUIRED_FIELDS = [
  "product_name",
  "estimated_price",
  "price_is_estimated",
  "category",
  "purchase_type",
  "verdict",
  "opinion",
  "pros",
  "cons",
] as const;

export const PURCHASE_TYPES = [
  "necesidad",
  "inversion",
  "antojo",
  "impulso",
] as const;

export const VERDICTS = ["buy", "think", "skip"] as const;
