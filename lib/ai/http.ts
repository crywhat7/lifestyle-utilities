import { logFailure, type AnalysisFailure } from "./types";

/**
 * Ambos proveedores alternan 503 por saturación y latencias que saltan de 1s
 * a 45s. Los 5xx se reintentan; un 429 no, porque la cuota no vuelve en dos
 * segundos y esperar solo le roba tiempo al usuario.
 */
const MAX_ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 25_000;
const RETRIABLE_STATUS = new Set([408, 500, 502, 503, 504]);

function backoff(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, attempt * 1_200));
}

export type PostOutcome =
  | { ok: true; payload: unknown }
  | { ok: false; kind: AnalysisFailure };

export async function postJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<PostOutcome> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const last = attempt === MAX_ATTEMPTS;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (RETRIABLE_STATUS.has(response.status) && !last) {
          await backoff(attempt);
          continue;
        }

        const detail = await response.text().catch(() => "");
        logFailure(`${label} devolvió HTTP ${response.status}`, detail);

        if (response.status === 429) return { ok: false, kind: "quota" };
        // Un modelo retirado (404) tampoco debe frenar la cascada.
        if (RETRIABLE_STATUS.has(response.status) || response.status === 404) {
          return { ok: false, kind: "overloaded" };
        }
        return { ok: false, kind: "bad_response" };
      }

      return { ok: true, payload: await response.json() };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";

      if (!last) {
        await backoff(attempt);
        continue;
      }

      logFailure(
        timedOut
          ? `${label} superó los ${ATTEMPT_TIMEOUT_MS}ms en ${MAX_ATTEMPTS} intentos`
          : `${label} falló por red`,
        error instanceof Error ? error.message : String(error)
      );
      return { ok: false, kind: timedOut ? "timeout" : "network" };
    }
  }

  return { ok: false, kind: "network" };
}

/** El texto llega como JSON dentro de JSON; acá se valida lo mínimo. */
export function parseAnalysis(label: string, text: unknown) {
  if (typeof text !== "string") {
    logFailure(`${label} respondió sin texto`);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (!Number.isFinite(parsed?.estimated_price)) {
      logFailure(`${label} no devolvió un precio numérico`);
      return null;
    }
    return parsed;
  } catch {
    logFailure(`${label} devolvió JSON inválido`, text);
    return null;
  }
}
