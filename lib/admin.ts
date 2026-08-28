import "server-only";

/**
 * Quién puede ver las herramientas de prueba.
 *
 * Sale de una variable de entorno y no de una constante en el código porque
 * este repo es público: un correo personal en el historial de git no se borra
 * nunca. Sin la variable puesta, no hay administrador y nadie ve nada.
 */
export function isAdmin(email: string | null | undefined) {
  const allowed = process.env.POCKET_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}
