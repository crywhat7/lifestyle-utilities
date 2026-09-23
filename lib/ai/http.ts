import { log } from "@/lib/log";
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

/** Menos que esto no alcanza para que un modelo conteste nada útil. */
const MIN_WINDOW_MS = 4_000;

/**
 * `deadline` es un reloj de pared (ms) compartido por toda una cascada.
 *
 * Sin él, tres modelos de Gemini con dos intentos de 25 s cada uno suman
 * 150 s: mucho más que los 60 s que la plataforma le da a la función. La
 * función moría a mitad de la cascada, el navegador recibía una respuesta
 * rota y la pantalla entera caía en el error de Next. Con el reloj, cada
 * intento se acorta a lo que queda y la cascada se rinde a tiempo para
 * contestar con un mensaje.
 */
export async function postJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  deadline?: number
): Promise<PostOutcome> {
  const started = Date.now();
  const outcome = await attemptJson(label, url, headers, body, deadline);

  /*
    Cada llamada a un modelo queda registrada, salga bien o mal: cuál
    modelo, cuánto tardó y por qué falló. La pantalla de registro muestra
    así qué modelo se está quedando sin cuota antes de que la gente lo note.
  */
  log({
    level: outcome.ok ? "info" : outcome.kind === "quota" || outcome.kind === "overloaded" ? "warn" : "error",
    source: "ai",
    event: outcome.ok ? "ai.call" : `ai.${outcome.kind}`,
    message: outcome.ok ? label : `${label} falló: ${outcome.kind}`,
    durationMs: Date.now() - started,
    detail: { model: label, host: new URL(url).host, requestBytes: body.length, deadline: deadline ? new Date(deadline).toISOString() : null },
  });

  return outcome;
}

async function attemptJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  deadline?: number
): Promise<PostOutcome> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const budget = deadline ? Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now()) : ATTEMPT_TIMEOUT_MS;
    if (budget < MIN_WINDOW_MS) return { ok: false, kind: "timeout" };

    const last = attempt === MAX_ATTEMPTS;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(budget),
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
