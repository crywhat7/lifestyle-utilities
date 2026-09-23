"use server";

import { log } from "@/lib/log";

export type ClientReport = {
  /** error | rejection | boundary */
  kind: string;
  message: string;
  stack?: string;
  /** El `digest` que Next le pone al error del servidor, para cruzarlos. */
  digest?: string;
  url?: string;
  userAgent?: string;
};

/**
 * Lo que se rompió en el navegador de alguien.
 *
 * Es la única parte del registro que el servidor no ve por sí mismo: un
 * error de JavaScript, una promesa rechazada o la pantalla de error de un
 * módulo. El navegador lo manda acá y queda con el resto. Todo se recorta
 * antes de guardar porque cualquiera puede llamar esta acción.
 */
export async function reportClientError(report: ClientReport) {
  let path: string | null = null;
  try {
    path = report.url ? new URL(report.url).pathname : null;
  } catch {
    path = null;
  }

  log({
    level: "error",
    source: "client",
    event: `client.${String(report.kind ?? "error").slice(0, 20)}`,
    message: String(report.message ?? "").slice(0, 500),
    path,
    detail: {
      digest: report.digest ? String(report.digest).slice(0, 80) : undefined,
      stack: report.stack ? String(report.stack).slice(0, 3_000) : undefined,
      userAgent: report.userAgent ? String(report.userAgent).slice(0, 200) : undefined,
    },
  });
}
