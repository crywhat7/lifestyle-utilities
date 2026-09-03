/**
 * Las rutas del módulo, sin nada del servidor colgando.
 *
 * `data.ts` es "server-only" y varios componentes del navegador necesitan
 * saber a dónde volver: si las constantes vivieran allá, importarlas desde el
 * cliente arrastraría el cliente de Supabase al bundle.
 */
export const CANVAS_PATH = "/hub/canvas";
export const LINK_PATH = `${CANVAS_PATH}/conexion`;
export const TASK_PATH = `${CANVAS_PATH}/tarea`;
