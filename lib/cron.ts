import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** El día de pago es el del bolsillo de la persona, no el del servidor. */
export const TIMEZONE = process.env.POCKET_TIMEZONE || "America/Tegucigalpa";

/**
 * `Authorization: Bearer <CRON_SECRET>`, o `?secret=` para los programadores
 * que no dejan poner cabeceras. La comparación es de tiempo constante.
 */
export function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = bearer || request.nextUrl.searchParams.get("secret") || "";

  return equals(provided, secret);
}

function equals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** YYYY-MM-DD en la zona del bolsillo, sin que UTC corra el día. */
export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * La hora de pared en la zona del bolsillo, en minutos desde medianoche.
 *
 * Los hábitos se agendan a las 07:00 de quien los escribió, no a las 07:00
 * UTC. Convertir con `getHours()` daría la hora del servidor —que en Vercel
 * es UTC— y el aviso saldría con seis horas de corrimiento.
 *
 * `hour12: false` con `hourCycle: "h23"` porque en algunos locales las 00:xx
 * se formatean como "24:xx" y el número se iría un día entero al futuro.
 */
export function minutesIn(timeZone: string) {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(new Date());

  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}
