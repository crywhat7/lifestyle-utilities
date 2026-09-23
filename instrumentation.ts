import type { Instrumentation } from "next";

/**
 * Todo error que Next atrapa en el servidor —al dibujar una página, en un
 * Route Handler, en una Server Action o en el proxy— termina acá antes de
 * convertirse en la pantalla de error. Es la red de abajo de todo: lo que
 * nadie previó igual queda en el registro, con la ruta y el `digest` que el
 * navegador recibe, para poder cruzar los dos lados.
 *
 * Se espera la escritura (`logAndWait`) porque este gancho corre fuera del
 * ciclo normal de la petición y nada más lo mantiene vivo.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logAndWait } = await import("@/lib/log");
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;

  await logAndWait({
    level: "error",
    source: "server",
    event: `server.${context.routeType}`,
    message: error instanceof Error ? error.message : String(error),
    path: request.path.split("?")[0],
    detail: {
      digest,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      error,
    },
  });
};
