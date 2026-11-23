"use server";

import { readGarment } from "@/lib/ai/garment";
import { currentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogFor, ownRows } from "./ai-catalog";

/** Lo que pesa una miniatura de 176 px, con holgura. */
const MAX_THUMB = 400_000;

export type PhotoGuess =
  | { ok: true; name: string; category: string; color: string | null }
  | { ok: false; error: string };

/**
 * Qué parece lo que se acaba de fotografiar.
 *
 * Es el mismo reconocimiento del panel pero antes de que la cosa exista: el
 * alta ahora empieza por la foto, y mientras la persona todavía está mirando
 * el encuadre el modelo ya está diciendo que eso es una camiseta blanca. Para
 * cuando aparece el formulario, está lleno.
 *
 * Se le manda la MINIATURA y no la foto grande. Son 176 px y alcanzan de
 * sobra para distinguir una camiseta de un pantalón; la grande son cientos de
 * kilobytes que en datos móviles se sienten, y acá el valor entero está en
 * que conteste antes de que uno termine de guardar el teléfono en el bolsillo.
 */
export async function guessPhoto(thumb: string): Promise<PhotoGuess> {
  /*
     La sesión se mira acá y NO con `roomsClient`, que redirige a la portada
     cuando no hay nadie. Esto corre solo, mientras la persona encuadra una
     foto: si la sesión venció, lo correcto es que no se reconozca nada y el
     formulario siga donde estaba. Una redirección en medio del alta se
     llevaría puesto el objeto que se estaba registrando.
  */
  const user = await currentUser();
  if (!user) return { ok: false, error: "Volvé a entrar para usar el reconocimiento." };

  const supabase = await createClient("lifestyle_utilities");

  if (typeof thumb !== "string" || thumb.length > MAX_THUMB) {
    return { ok: false, error: "Esa foto no se pudo leer." };
  }

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(thumb);
  if (!match) return { ok: false, error: "Esa foto no se pudo leer." };

  const { data: mine } = await supabase
    .from("rooms_categories")
    .select("id,label")
    .eq("user_id", user.id);

  const { categories, colors } = catalogFor(ownRows(mine));

  const read = await readGarment({
    mimeType: match[1],
    base64: match[2],
    categories,
    colors,
  });

  if (!read.ok) {
    return {
      ok: false,
      error:
        read.kind === "no_key"
          ? "El reconocimiento por foto no está configurado."
          : "No se pudo reconocer la foto.",
    };
  }

  return { ok: true, ...read.guess };
}
