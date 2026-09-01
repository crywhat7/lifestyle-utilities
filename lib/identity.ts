/**
 * La identidad que el proxy ya verificó, viajando hacia la página.
 *
 * `proxy.ts` valida la sesión en TODA petición protegida: eso ya es un ida y
 * vuelta. Si además cada página llamaba a `auth.getUser()`, cada navegación
 * pagaba dos viajes a Supabase antes de tocar una sola tabla —y eso se sentía
 * como un botón que no responde. El proxy escribe acá lo que ya comprobó y
 * `currentUser()` en `lib/auth.ts` lo lee sin salir a la red.
 *
 * Este archivo no importa nada: lo comparten el proxy (que corre en el borde)
 * y el servidor de la app.
 */
export const IDENTITY_HEADER = "x-lu-identity";

/**
 * Lo que el proxy escribe cuando comprobó que no hay nadie.
 *
 * No es lo mismo que la cabecera ausente: ausente significa "esta ruta no
 * pasó por el proxy" y obliga a preguntarle a Supabase. Este valor significa
 * "ya pregunté, no hay sesión", y ahorra ese viaje en la pantalla de acceso.
 */
export const ANONYMOUS = "-";

export type SessionUser = {
  id: string;
  email: string | null;
  /** `full_name` o `name` de los metadatos, si el proveedor los mandó. */
  name: string | null;
};

/** Serializa la identidad a un valor de cabecera ASCII. */
export function encodeIdentity(user: SessionUser) {
  return encodeURIComponent(JSON.stringify(user));
}

export function decodeIdentity(raw: string): SessionUser | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<SessionUser>;
    if (typeof parsed?.id !== "string" || parsed.id.length === 0) return null;

    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
    };
  } catch {
    return null;
  }
}
