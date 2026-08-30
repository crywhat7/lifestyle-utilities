import "server-only";
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
