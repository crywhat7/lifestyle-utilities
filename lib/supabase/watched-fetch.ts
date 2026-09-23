import "server-only";
import { log } from "@/lib/log";

/**
 * El `fetch` que usan los clientes de Supabase del servidor.
 *
 * Casi todas las consultas de la app miran `error` y siguen de largo —con
 * un mensaje amable, o con nada—, así que el motivo real (una columna que
 * falta, una política de RLS, un constraint) se perdía. Esto lo atrapa en
 * un solo lugar, para toda la app: cada respuesta que no fue 2xx queda en
 * el registro con la tabla, el método y lo que contestó Postgres.
 *
 * Lo que no se registra: los 401/403 de `/auth/v1`, que son sesiones
 * vencidas —ruido normal, no fallas—.
 */
export const watchedFetch: typeof fetch = async (input, init) => {
  const started = Date.now();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

  let where = url;
  try {
    const parsed = new URL(url);
    where = parsed.pathname.replace(/^\/rest\/v1\//, "");
  } catch {
    /* se queda con la URL entera */
  }

  try {
    const response = await fetch(input, init);

    const quietAuth = where.startsWith("/auth/v1") && response.status < 500;
    if (!response.ok && !quietAuth) {
      const body = await response
        .clone()
        .text()
        .catch(() => "");
      log({
        level: response.status >= 500 || response.status === 400 ? "error" : "warn",
        source: "db",
        event: "db.failed",
        message: `${method} ${where} → ${response.status}`,
        durationMs: Date.now() - started,
        detail: { method, target: where, status: response.status, response: body.slice(0, 2_000) },
      });
    }

    return response;
  } catch (cause) {
    log({
      level: "error",
      source: "db",
      event: "db.unreachable",
      message: `${method} ${where}: no se pudo llegar a Supabase`,
      durationMs: Date.now() - started,
      detail: cause,
    });
    throw cause;
  }
};
