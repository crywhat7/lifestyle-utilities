import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role: se salta RLS y ve a todos los usuarios.
 *
 * Existe solo para los trabajos que corren sin nadie sentado adelante —hoy,
 * el registro automático de salarios— y jamás debe alcanzarse desde una ruta
 * que responda a una sesión de navegador. La llave nunca sale del servidor.
 */
export function createAdminClient(schema = "lifestyle_utilities") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createSupabaseClient(url, key, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
