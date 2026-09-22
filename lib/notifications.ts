import "server-only";
import { dayStatus, formatKcal, type Goal, type NudgeKind as FuelNudgeKind } from "@/lib/fuel";
import { formatMoney } from "@/lib/money";
import type { PushPayload } from "@/lib/push";

/**
 * Los textos de los avisos viven acá y no dentro de cada ruta: el cron y el
 * botón de prueba mandan exactamente lo mismo, así que probar en producción
 * prueba de verdad lo que la gente va a recibir.
 */

export type DayStats = {
  count: number;
  total: number;
  currency: string;
};

/**
 * Recordatorio de media tarde y de noche.
 *
 * Nunca dice lo mismo: si ya registraste algo, el aviso lo reconoce en vez de
 * pedirte lo que ya hiciste. Un recordatorio que ignora lo que hiciste se
 * vuelve ruido y se apaga a la semana.
 */
export function reminderPayload({ count, total, currency }: DayStats): PushPayload {
  if (count === 0) {
    return {
      title: "¿En qué se te fue hoy?",
      body: "Todavía no registraste nada. Toma diez segundos.",
      url: "/hub/my-pocket/nuevo/egreso",
      tag: "pocket-reminder",
    };
  }

  return {
    title: `Llevás ${formatMoney(total, currency)} hoy`,
    body:
      count === 1
        ? "Un movimiento registrado. ¿Falta alguno?"
        : `${count} movimientos registrados. ¿Falta alguno?`,
    url: "/hub/my-pocket/nuevo/egreso",
    tag: "pocket-reminder",
  };
}

export type SalaryPush = {
  label: string;
  amountBase: number;
  baseCurrency: string;
};

export function salaryPayload(lines: SalaryPush[]): PushPayload {
  const total = lines.reduce((sum, line) => sum + line.amountBase, 0);
  const single = lines.length === 1;

  return {
    title: single ? `Entró tu ${lines[0].label.toLowerCase()}` : "Entró tu pago",
    body: `+${formatMoney(total, lines[0].baseCurrency)} ya está en tu balance.`,
    url: "/hub/my-pocket",
    tag: "pocket-salary",
  };
}

/* -------------------------------------------------------------------------- */
/* Clean Daily                                                                 */
/* -------------------------------------------------------------------------- */

export type HabitNudge = {
  name: string;
  polarity: "good" | "bad";
  cue: string | null;
  reward: string | null;
  place: string | null;
  /** "HH:MM" en la zona del bolsillo. */
  time: string | null;
  endTime: string | null;
  /** `start` = se abrió la ventana. `last_call` = está por cerrarse. */
  kind: "start" | "last_call";
};

/**
 * El aviso ES la señal.
 *
 * Ese es todo el punto del recordatorio: el libro dice que la señal tiene que
 * ser obvia, y no hay nada más obvio que el teléfono diciéndola en voz alta a
 * la hora exacta. Por eso el texto repite la señal y el resultado que la
 * persona escribió: no es "acordate del hábito", es el ciclo completo puesto
 * enfrente en el momento en que sirve.
 *
 * El hábito malo nunca se recuerda —"acordate de tomar coca-cola" sería
 * absurdo—: se pregunta. Es un chequeo sin reproche, y la respuesta honesta
 * puede perfectamente ser cero.
 */
export function habitPayload(lines: HabitNudge[]): PushPayload {
  const url = "/hub/clean-daily";
  const tag = "clean-habit";

  if (lines.length > 1) {
    const names = lines.slice(0, 3).map((line) => line.name);
    return {
      title: `${lines.length} hábitos ahora`,
      body: `${names.join(", ")}${lines.length > 3 ? " y más" : ""}.`,
      url,
      tag,
    };
  }

  const line = lines[0];

  if (line.kind === "last_call") {
    return {
      title: `Última llamada: ${line.name}`,
      body: line.endTime
        ? `La ventana cierra a las ${line.endTime}. Todavía llegás.`
        : "Todavía llegás.",
      url,
      tag,
    };
  }

  if (line.polarity === "bad") {
    return {
      title: `¿Cómo vas con ${line.name.toLowerCase()}?`,
      body: "Si caíste, sumalo. Si no, dejalo en cero — así queda medido.",
      url,
      tag,
    };
  }

  /*
    El orden importa porque el sistema operativo corta el cuerpo: primero lo
    que dispara, después dónde, y último la recompensa. Si algo se pierde por
    el corte, que sea lo menos accionable.
  */
  const detail = [
    line.cue ? `Señal: ${line.cue}` : null,
    line.place ? `En ${line.place.toLowerCase()}` : null,
    line.reward ? `Resultado: ${line.reward}` : null,
  ].filter(Boolean);

  return {
    title: `Ahora: ${line.name}`,
    body:
      detail.length > 0
        ? `${detail.join(" · ")}.`
        : "Tocá para marcarlo cuando lo hagas.",
    url,
    tag,
  };
}

export type DueLine = {
  id: string;
  name: string;
  amount: number;
  amountMax: number | null;
  currency: string;
};

/** "L 800" o "L 800 a L 1,200", según tenga rango o no. */
function rangeText(line: DueLine) {
  const from = formatMoney(line.amount, line.currency);
  return line.amountMax
    ? `${from} a ${formatMoney(line.amountMax, line.currency)}`
    : from;
}

/**
 * Hoy vence algo contemplado.
 *
 * Reemplaza al recordatorio genérico cuando hay algo concreto que decir: un
 * aviso que nombra la renta y su monto se atiende, y "¿en qué se te fue hoy?"
 * el mismo día que vence la renta es ruido puesto encima de una obligación.
 *
 * Con uno solo, el aviso lleva directo a registrarlo con la plantilla puesta.
 */
export function duePayload(lines: DueLine[]): PushPayload {
  if (lines.length === 1) {
    const line = lines[0];
    return {
      title: `Hoy toca ${line.name}`,
      body: `${rangeText(line)}. Tocá para registrarlo.`,
      url: `/hub/my-pocket/nuevo/egreso?fijo=${line.id}`,
      tag: "pocket-due",
    };
  }

  return {
    title: `Hoy tocan ${lines.length} gastos`,
    body: `${lines
      .slice(0, 3)
      .map((line) => line.name)
      .join(", ")}${lines.length > 3 ? " y más" : ""}. Tocá para registrarlos.`,
    url: "/hub/my-pocket",
    tag: "pocket-due",
  };
}

/* -------------------------------------------------------------------------- */
/* Fuel                                                                        */
/* -------------------------------------------------------------------------- */

export type FuelNudge = {
  kind: FuelNudgeKind;
  eaten: number;
  target: number;
  goal: Goal;
  meals: number;
};

/**
 * El parte de calorías.
 *
 * Siempre lleva la cifra que importa en el título —lo que falta o lo que se
 * pasó—, porque el sistema operativo muestra el título entero y el cuerpo
 * cortado. El tono cambia con la meta: a quien quiere subir, quedarse corto
 * a la noche es el problema, no pasarse.
 *
 * Nunca regaña. Un aviso que hace sentir mal a las nueve de la noche se
 * apaga, y con él se apaga el registro entero.
 */
export function fuelPayload({ kind, eaten, target, goal, meals }: FuelNudge): PushPayload {
  const url = "/hub/fuel";
  const tag = "fuel";
  const { remaining, tone } = dayStatus(eaten, target);
  const left = formatKcal(Math.abs(remaining));
  const of = `${formatKcal(eaten)} de ${formatKcal(target)} kcal`;

  if (kind === "over" || tone === "over") {
    return {
      title: `Te pasaste por ${left} kcal`,
      body:
        goal === "gain"
          ? `Llevás ${of}. Para subir, un día arriba no es problema.`
          : `Llevás ${of}. Lo que queda del día, liviano; mañana arranca en cero.`,
      url,
      tag,
    };
  }

  if (meals === 0) {
    return {
      title: kind === "morning" ? "¿Ya desayunaste?" : "Hoy no hay nada registrado",
      body: `Tu meta es ${formatKcal(target)} kcal. Tomale foto a lo próximo que comás.`,
      url,
      tag,
    };
  }

  if (tone === "met") {
    return {
      title: "Meta del día cumplida",
      body: `Llevás ${of}. Si te da hambre, que sea algo liviano.`,
      url,
      tag,
    };
  }

  if (tone === "near") {
    return {
      title: `Te faltan ${left} kcal`,
      body: `Llevás ${of}. Un aperitivo chico y cerrás el día.`,
      url,
      tag,
    };
  }

  if (kind === "night") {
    return {
      title: `Te faltan ${left} kcal`,
      body:
        goal === "gain"
          ? `Llevás ${of}. Para subir hace falta completar: una cena más o un aperitivo fuerte.`
          : `Llevás ${of}. ¿Falta registrar la cena?`,
      url,
      tag,
    };
  }

  return {
    title: `Llevás ${formatKcal(eaten)} kcal`,
    body: `Te quedan ${left} de ${formatKcal(target)} para hoy.`,
    url,
    tag,
  };
}
