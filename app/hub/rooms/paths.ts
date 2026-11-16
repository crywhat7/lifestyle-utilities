/**
 * Las direcciones del módulo.
 *
 * Viven solas y no en `data.ts` por una razón concreta: `data.ts` lleva
 * `server-only`, y la fila de una gaveta —que es un componente de cliente—
 * necesita saber a dónde enlaza. Importar el loader desde el navegador
 * rompería el build, así que lo único compartido se queda acá, sin
 * dependencias.
 */

export const ROOMS_PATH = "/hub/rooms";

/** La pantalla de un nodo: habitación, mueble, gaveta o caja. */
export function nodePath(id: string) {
  return `${ROOMS_PATH}/${id}`;
}
