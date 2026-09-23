import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { after } from "next/server";
import { decodeIdentity, IDENTITY_HEADER } from "@/lib/identity";

/**
 * El registro de todo lo que pasa en la app.
 *
 * Cada evento va a dos lugares a la vez, y no por redundancia decorativa:
 *
 *   1. A la consola, siempre y primero. Vercel la guarda unos días y es lo
 *      único que queda si la base misma está caída.
 *   2. A `app_logs`, que es permanente y se puede buscar desde /hub/registro.
 *
 * La escritura a la base sale con `after()`: se hace cuando la respuesta ya
 * se mandó, así que registrar nunca le suma un milisegundo a quien espera.
 * Fuera de una petición (no debería pasar, pero por las dudas) se manda
 * igual, sin esperar.
 *
 * Registrar jamás puede romper lo que se está registrando: todo esto está
 * envuelto para que una falla del registro termine, como mucho, en la
 * consola.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  /** ai, db, server, client, cron, push, mail, canvas, fx, tex, office… */
  source: string;
  /** Qué pasó, en corto y estable para poder filtrar: `ai.call`, `cron.run`. */
  event: string;
  message?: string;
  userId?: string | null;
  path?: string | null;
  durationMs?: number | null;
  detail?: unknown;
};

/* -------------------------------------------------------------------------- */
/* Limpieza                                                                    */
/* -------------------------------------------------------------------------- */

/** Llaves cuyo valor nunca se escribe, ni en la consola ni en la base. */
const SECRET_KEY = /(api[-_]?key|token|secret|password|authorization|cookie|p256dh|^auth$|base64|thumb|inline_data|image_url)/i;
const MAX_STRING = 2_000;
const MAX_DETAIL = 16_000;

function scrub(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    // Una imagen en base64 que se coló en un texto se nota por el largo sin espacios.
    if (value.length > 400 && !/\s/.test(value.slice(0, 400))) return `[${value.length} caracteres omitidos]`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [+${value.length - MAX_STRING}]` : value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 8).join("\n") };
  }
  if (depth > 5) return "[demasiado profundo]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrub(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      out[key] = SECRET_KEY.test(key) ? "[oculto]" : scrub(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

function toDetail(detail: unknown) {
  if (detail === undefined) return null;
  const clean = scrub(detail);
  const json = JSON.stringify(clean);
  if (json && json.length > MAX_DETAIL) return { truncated: true, preview: json.slice(0, MAX_DETAIL) };
  return clean;
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                   */
/* -------------------------------------------------------------------------- */

/*
  Un cliente propio, sin el `fetch` vigilado de `lib/supabase`: si el
  registrador usara el cliente que registra sus propias fallas, un insert
  fallido en `app_logs` generaría otro evento, que fallaría igual, y así.
*/
function makeClient(url: string, key: string) {
  return createSupabaseClient(url, key, {
    db: { schema: "lifestyle_utilities" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let client: ReturnType<typeof makeClient> | null = null;

function logClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= makeClient(url, key);
  return client;
}

function toConsole(entry: LogEntry, detail: unknown) {
  const line = `[${entry.source}] ${entry.event}${entry.message ? ` — ${entry.message}` : ""}`;
  const extra = detail == null ? "" : JSON.stringify(detail).slice(0, 1_500);
  if (entry.level === "error") console.error(line, extra);
  else if (entry.level === "warn") console.warn(line, extra);
  else console.log(line, extra);
}

/** Quién y dónde, sacado de la petición en curso cuando la hay. */
async function context(pending: Promise<Headers> | null) {
  if (!pending) return { userId: null, path: null };
  try {
    const list = await pending;
    const identity = list.get(IDENTITY_HEADER);
    const user = identity && identity !== "-" ? decodeIdentity(identity) : null;
    // En una Server Action la URL de la petición no es la pantalla: la
    // pantalla es el referer. Es lo que responde "¿dónde estaba?".
    const referer = list.get("referer");
    let path: string | null = null;
    try {
      path = referer ? new URL(referer).pathname : null;
    } catch {
      path = null;
    }
    return { userId: user?.id ?? null, path };
  } catch {
    return { userId: null, path: null };
  }
}

async function write(entry: LogEntry, detail: unknown, pending: Promise<Headers> | null) {
  const supabase = logClient();
  if (!supabase) return;

  const found = await context(pending);
  const { error } = await supabase.from("app_logs").insert({
    level: entry.level,
    source: entry.source.slice(0, 40),
    event: entry.event.slice(0, 80),
    message: entry.message?.slice(0, 1_000) ?? null,
    user_id: entry.userId ?? found.userId,
    path: (entry.path ?? found.path)?.slice(0, 300) ?? null,
    duration_ms: entry.durationMs == null ? null : Math.round(entry.durationMs),
    detail,
  } as never);

  // La base no aceptó el evento: queda al menos en la consola, completo.
  if (error) console.error("[log] no se pudo guardar el evento", error.message, JSON.stringify(entry).slice(0, 1_500));
}

export function log(entry: LogEntry) {
  try {
    const detail = toDetail(entry.detail);
    toConsole(entry, detail);

    let pending: Promise<Headers> | null = null;
    try {
      pending = headers();
      // Fuera de una petición la promesa puede rechazar: se marca atendida.
      pending.catch(() => {});
    } catch {
      pending = null;
    }

    const task = () => write(entry, detail, pending).catch((cause) => console.error("[log] falló", cause));

    try {
      after(task);
    } catch {
      void task();
    }
  } catch (cause) {
    console.error("[log] no se pudo registrar", cause);
  }
}

/** Atajos, para que registrar no cueste más que un `console.error`. */
export const logInfo = (source: string, event: string, message?: string, detail?: unknown) =>
  log({ level: "info", source, event, message, detail });
export const logWarn = (source: string, event: string, message?: string, detail?: unknown) =>
  log({ level: "warn", source, event, message, detail });
export const logError = (source: string, event: string, message?: string, detail?: unknown) =>
  log({ level: "error", source, event, message, detail });

/**
 * Mide y registra una operación entera: cuánto tardó, si terminó bien, y el
 * error completo si no. Devuelve lo mismo que la operación, o relanza.
 */
export async function traced<T>(
  source: string,
  event: string,
  run: () => Promise<T>,
  describe?: (result: T) => { level?: LogLevel; message?: string; detail?: unknown }
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    const extra = describe?.(result) ?? {};
    log({
      level: extra.level ?? "info",
      source,
      event,
      message: extra.message,
      detail: extra.detail,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (cause) {
    log({ level: "error", source, event, message: "La operación tiró una excepción", detail: cause, durationMs: Date.now() - started });
    throw cause;
  }
}

/**
 * Igual que `log`, pero espera a que el evento quede escrito. Para los
 * lugares donde después no hay nada que lo sostenga vivo —el gancho de
 * errores de Next corre fuera del ciclo de la petición—.
 */
export async function logAndWait(entry: LogEntry) {
  try {
    const detail = toDetail(entry.detail);
    toConsole(entry, detail);
    await write(entry, detail, null);
  } catch (cause) {
    console.error("[log] no se pudo registrar", cause);
  }
}

/**
 * Una corrida de cron, entera: estado HTTP, cuánto tardó y el JSON que
 * devolvió (cuántos avisos, a quién, qué falló). cron-job.org solo guarda
 * si respondió 200; esto guarda qué hizo de verdad.
 */
export async function traceCron(name: string, request: Request, run: () => Promise<Response>) {
  const started = Date.now();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  delete params.secret;

  try {
    const response = await run();
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null;
    const failed = response.status >= 500;
    const partial =
      Array.isArray(body?.errors) && body.errors.length > 0
        ? true
        : Boolean((body?.fuel as { error?: string } | undefined)?.error);

    log({
      level: failed ? "error" : response.status === 401 || partial ? "warn" : "info",
      source: "cron",
      event: `cron.${name}`,
      message: `${name} → ${response.status}${typeof body?.pushed === "number" ? ` · ${body.pushed} push` : ""}`,
      durationMs: Date.now() - started,
      path: new URL(request.url).pathname,
      detail: { status: response.status, params, response: body },
    });

    return response;
  } catch (cause) {
    log({
      level: "error",
      source: "cron",
      event: `cron.${name}`,
      message: `${name} tiró una excepción`,
      durationMs: Date.now() - started,
      path: new URL(request.url).pathname,
      detail: { params, error: cause },
    });
    throw cause;
  }
}
