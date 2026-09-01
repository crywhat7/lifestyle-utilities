import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import {
  ANONYMOUS,
  decodeIdentity,
  IDENTITY_HEADER,
  type SessionUser,
} from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";

export type { SessionUser };

/**
 * Quién está mirando la pantalla.
 *
 * Confía en la cabecera porque el proxy la reescribe —o la borra— en cada
 * petición que hace match con su matcher, así que nadie puede mandarla desde
 * afuera. Y aunque pudiera: las consultas siguen saliendo con el JWT de la
 * sesión, así que RLS no devolvería una fila ajena de todos modos. Si la
 * cabecera no está (una ruta fuera del matcher), se pregunta a Supabase.
 *
 * `cache()` la deja en una sola lectura por render, sin importar cuántos
 * componentes o helpers la pidan.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const raw = (await headers()).get(IDENTITY_HEADER);
  if (raw === ANONYMOUS) return null;
  if (raw) return decodeIdentity(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
  };
});
