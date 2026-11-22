/**
 * Las direcciones del módulo.
 *
 * Viven solas y no en `data.ts` por una razón concreta: `data.ts` lleva
 * `server-only`, y la fila de una gaveta —que es un componente de cliente—
 * necesita saber a dónde enlaza. Importar el loader desde el navegador
 * rompería el build, así que lo único compartido se queda acá, sin
 * dependencias.
 *
 * Que cada formulario tenga su propia dirección no es un detalle de
 * organización: es lo que arregla de raíz los problemas de las hojas que
 * subían desde abajo —no se podían cerrar con el teclado abierto, el scroll
 * peleaba con el de la página y "atrás" cerraba de más— y de paso vuelve
 * compartible cada pantalla.
 */

export const ROOMS_PATH = "/hub/rooms";
export const OUTFITS_PATH = `${ROOMS_PATH}/outfits`;

/** Las categorías propias: renombrar, recolorear, borrar. */
export const CATEGORIES_PATH = `${ROOMS_PATH}/categorias`;

/** La pantalla de un nodo: habitación, mueble, gaveta o caja. */
export function nodePath(id: string) {
  return `${ROOMS_PATH}/${id}`;
}

/** Crear una habitación nueva. */
export function newRoomPath() {
  return `${ROOMS_PATH}/nueva`;
}

/** Crear algo dentro de este contenedor: un mueble, una gaveta, una caja. */
export function addPath(id: string, kind: string) {
  return `${ROOMS_PATH}/${id}/agregar?tipo=${kind}`;
}

/** Editar este contenedor. */
export function editPath(id: string) {
  return `${ROOMS_PATH}/${id}/editar`;
}

/** Guardar una cosa acá dentro. */
export function newItemPath(id: string) {
  return `${ROOMS_PATH}/${id}/cosa`;
}

/**
 * Guardar una prenda acá dentro.
 *
 * Dirección propia y no un parámetro de la de arriba: es otra pantalla desde
 * el primer toque —otra grilla, otras trece casillas— y la lista la ofrece
 * como otro botón.
 */
export function newWearPath(id: string) {
  return `${ROOMS_PATH}/${id}/ropa`;
}

/** Abrir una cosa ya guardada. */
export function itemPath(nodeId: string, itemId: string) {
  return `${ROOMS_PATH}/${nodeId}/cosa/${itemId}`;
}

/**
 * Cómo llegar a una cosa.
 *
 * Tiene dirección propia a propósito: el camino hasta algo es justamente lo
 * que uno quiere poder mandarle a alguien.
 */
export function trailPath(itemId: string) {
  return `${ROOMS_PATH}/ruta/${itemId}`;
}
