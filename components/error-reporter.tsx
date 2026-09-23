"use client";

import { useEffect } from "react";
import { reportClientError, type ClientReport } from "@/lib/client-report";

/** Tope por página: un error dentro de un bucle no puede inundar el registro. */
const MAX_REPORTS = 10;
let sent = 0;
const seen = new Set<string>();

/**
 * Manda un error del navegador al registro, una sola vez por mensaje.
 * Nunca tira: si el reporte mismo falla, no hay a quién avisarle.
 */
export function report(input: Omit<ClientReport, "url" | "userAgent">) {
  const key = `${input.kind}:${input.message}`;
  if (sent >= MAX_REPORTS || seen.has(key)) return;
  seen.add(key);
  sent += 1;

  reportClientError({
    ...input,
    url: window.location.href,
    userAgent: navigator.userAgent,
  }).catch(() => {});
}

/**
 * Escucha los errores que nadie atrapó en el navegador —un script que
 * revienta, una promesa rechazada sin `catch`— y los manda al registro.
 * Los errores que sí atrapa una pantalla de error los reporta ella misma.
 */
export function ErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      report({
        kind: "error",
        message: event.message || String(event.error),
        stack: event.error instanceof Error ? event.error.stack : `${event.filename}:${event.lineno}:${event.colno}`,
      });
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      report({
        kind: "rejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
