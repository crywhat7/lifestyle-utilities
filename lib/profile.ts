/**
 * La identidad de quien usa la app: nombre, apodo y a dónde le escribimos.
 *
 * Vive fuera de cualquier herramienta porque no le pertenece a ninguna: My
 * Pocket, Should I Buy It y Clean Daily leen la misma persona. Y no importa
 * nada del servidor a propósito — el formulario del navegador valida con
 * estas mismas reglas antes de mandar, así el error se ve al tipear y no
 * después de un viaje de ida y vuelta.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const NAME_MAX = 60;

/** El mismo formato que impone la migración 0012, para el `pattern` del input. */
export const USERNAME_PATTERN = `[a-z0-9._]{${USERNAME_MIN},${USERNAME_MAX}}`;

export type UserProfile = {
  name: string | null;
  username: string | null;
  notification_email: string | null;
};

/**
 * Deja el apodo como lo guarda la base: minúsculas, sin acentos y sin nada
 * que no sea letra, dígito, punto o guion bajo.
 *
 * Se aplica mientras la persona escribe, así que nunca puede tipear algo que
 * el servidor vaya a rechazar por caracteres: lo único que queda por decir es
 * el largo y si ya está tomado.
 */
export function normalizeUsername(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._]+/g, ".")
    .replace(/[._]{2,}/g, (run) => run[0])
    .replace(/^[._]+/, "")
    .slice(0, USERNAME_MAX);
}

/** Lo que está mal con el apodo, dicho como se lo diríamos a la persona. */
export function usernameIssue(value: string): string | null {
  if (value.length === 0) return null; // Vacío es válido: nadie está obligado.
  if (value.length < USERNAME_MIN)
    return `Al menos ${USERNAME_MIN} caracteres.`;
  if (value.length > USERNAME_MAX)
    return `Como mucho ${USERNAME_MAX} caracteres.`;
  if (!new RegExp(`^${USERNAME_PATTERN}$`).test(value))
    return "Solo minúsculas, números, punto y guion bajo.";
  if (/[._]$/.test(value)) return "No puede terminar en punto ni en guion bajo.";
  return null;
}

/** Un apodo de arranque a partir del correo o del nombre, para el placeholder. */
export function suggestUsername(seed: string | null | undefined) {
  const base = normalizeUsername((seed ?? "").split("@")[0] ?? "");
  return base.length >= USERNAME_MIN ? base : "";
}

/** Las dos primeras iniciales del nombre, para el disco del avatar. */
export function initialsOf(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Con qué nombre saludamos.
 *
 * El perfil manda sobre lo que dijo Google, y el correo es el último recurso
 * antes de "invitado": alguien sin nombre igual tiene que poder ser saludado.
 */
export function resolveName(
  profileName: string | null | undefined,
  metadataName: string | null | undefined,
  email: string | null | undefined
) {
  return (
    profileName?.trim() ||
    metadataName?.trim() ||
    email?.split("@")[0] ||
    "invitado"
  );
}
