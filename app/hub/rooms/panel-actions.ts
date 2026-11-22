"use server";

import { COLORS, catalog, wearCatalog } from "@/lib/rooms";
import { readGarment } from "@/lib/ai/garment";
import {
  isCategory,
  isCondition,
  isGarment,
  isId,
  isOwnCategory,
  isSwatch,
} from "@/lib/rooms";
import { roomsClient } from "./data";
import { ROOMS_PATH, nodePath } from "./paths";
import { revalidatePath } from "next/cache";
import { putCutout, putPhoto, putSecond, readPhoto } from "./storage";

/**
 * El panel de escritorio escribe distinto que el teléfono.
 *
 * En el teléfono se llena un formulario y se guarda: un botón, un envío, una
 * cosa. Acá se AUDITA —se abren ciento veinte prendas seguidas a corregirles
 * el nombre, el color y la categoría— y un botón de guardar por campo sería
 * ciento veinte toques de más y, peor, ciento veinte oportunidades de perder
 * un cambio por cerrar la pestaña.
 *
 * Así que cada campo se guarda solo, un rato después de dejar de escribir.
 * Eso cambia lo que tiene que hacer el servidor: en vez de una acción que
 * recibe el objeto entero, una que recibe SOLO lo que cambió y no toca el
 * resto. Mandar el objeto entero desde una pantalla que se editó durante
 * veinte minutos es la receta para pisar con datos viejos lo que se cambió
 * en otro lado.
 */

const MAX_IMAGE = 8 * 1024 * 1024;

export type Patch = {
  name?: string;
  category?: string;
  color?: string | null;
  condition?: string;
  quantity?: number;
  note?: string | null;
  node_id?: string;
};

export type Saved = { ok: boolean; error?: string };

function clean(patch: Patch) {
  const next: Record<string, unknown> = {};

  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 80);
    /* Un nombre vacío no se guarda y tampoco se rechaza con un cartel: en una
       auditoría uno borra el campo para reescribirlo, y un error rojo por
       cada letra borrada sería ruido. Simplemente no se escribe hasta que
       haya algo. */
    if (name) next.name = name;
  }

  if (typeof patch.category === "string") {
    const key = patch.category;
    if (isCategory(key) || isGarment(key) || isOwnCategory(key)) next.category = key;
  }

  if (patch.color !== undefined) {
    next.color = isSwatch(patch.color) ? patch.color : null;
  }

  if (typeof patch.condition === "string" && isCondition(patch.condition)) {
    next.condition = patch.condition;
  }

  if (typeof patch.quantity === "number" && Number.isFinite(patch.quantity)) {
    next.quantity = Math.min(9999, Math.max(1, Math.round(patch.quantity)));
  }

  if (patch.note !== undefined) {
    const note = String(patch.note ?? "").trim().slice(0, 400);
    next.note = note || null;
  }

  return next;
}

/** Guardar lo que cambió de una cosa, y nada más. */
export async function patchItem(id: string, patch: Patch): Promise<Saved> {
  if (!isId(id)) return { ok: false, error: "No se encontró la cosa." };

  const { supabase, user } = await roomsClient();
  const next = clean(patch);

  /*
     Mover es aparte del resto porque hay que comprobar el destino. RLS
     protege la FILA del ítem —nadie edita lo que no es suyo— pero no mira el
     valor que se escribe dentro: sin esto, un id inventado mandaría la cosa
     al mueble de otra persona.
  */
  let moved: string | null = null;

  if (typeof patch.node_id === "string" && isId(patch.node_id)) {
    const { data: owned } = await supabase
      .from("rooms_nodes")
      .select("id")
      .eq("id", patch.node_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (owned) {
      next.node_id = patch.node_id;
      moved = patch.node_id;
    }
  }

  if (Object.keys(next).length === 0) return { ok: true };

  const { error } = await supabase
    .from("rooms_items")
    .update(next)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "No se pudo guardar." };

  /* El panel no se repinta desde el servidor —lo que se ve ya es lo que se
     escribió— pero las otras pantallas sí: la lista del cajón y la portada
     tienen que enterarse de que esta prenda ahora se llama distinto. */
  revalidatePath(ROOMS_PATH);
  if (moved) revalidatePath(nodePath(moved));

  return { ok: true };
}

/**
 * Pegar una imagen del portapapeles.
 *
 * Es el reemplazo honesto de quitar el fondo dentro de la app. El recorte en
 * el teléfono salía mal —y arreglarlo es pelear con un modelo chico en un
 * navegador—, mientras que copiar la foto, pasarla por la herramienta que
 * uno prefiera y pegarla de vuelta toma diez segundos y sale perfecto.
 *
 * Tres destinos: la foto, la otra punta del cable, y la "foto de outfit",
 * que es la que usa el maniquí. Esa última entra tal cual, sin recortar ni
 * convertir: si es un PNG con transparencia, la transparencia ES el dato.
 */
export async function pasteImage(form: FormData): Promise<Saved> {
  const { supabase, user } = await roomsClient();

  const id = String(form.get("id") ?? "");
  if (!isId(id)) return { ok: false, error: "No se encontró la cosa." };

  const slot = String(form.get("slot") ?? "");
  if (slot !== "main" && slot !== "second" && slot !== "cutout") {
    return { ok: false, error: "No sé dónde poner esa imagen." };
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No llegó ninguna imagen." };
  }
  if (file.size > MAX_IMAGE || !file.type.startsWith("image/")) {
    return { ok: false, error: "Esa imagen no sirve." };
  }
  if (slot === "cutout" && file.type !== "image/png") {
    return { ok: false, error: "La foto de outfit tiene que ser PNG." };
  }

  const { data } = await supabase
    .from("rooms_items")
    .select("id,node_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { ok: false, error: "Esa cosa no existe." };

  const thumb = String(form.get("thumb") ?? "");
  const good = thumb.startsWith("data:image/");

  let patch: Record<string, string> | null = null;

  if (slot === "cutout") {
    const path = await putCutout(user.id, id, file);
    if (path) patch = { cutout_path: path };
  } else if (slot === "second") {
    const path = await putSecond(user.id, id, file);
    if (path) patch = { second_path: path, ...(good ? { second_thumb: thumb } : {}) };
  } else {
    const path = await putPhoto(user.id, id, file);
    if (path) patch = { storage_path: path, ...(good ? { thumb } : {}) };
  }

  if (!patch) return { ok: false, error: "No se pudo subir la imagen." };

  const { error } = await supabase
    .from("rooms_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "No se pudo guardar la imagen." };

  revalidatePath(ROOMS_PATH);
  revalidatePath(nodePath(String(data.node_id)));

  return { ok: true };
}

/**
 * Qué parece esta cosa, según la foto.
 *
 * Devuelve una propuesta y no la guarda: ver `lib/ai/garment.ts`. El panel la
 * muestra en una barra con un botón para aplicarla, que es la diferencia
 * entre una herramienta y un modelo escribiendo en la base sin que nadie
 * mire.
 */
export type Guess =
  | { ok: true; name: string; category: string; color: string | null }
  | { ok: false; error: string };

export async function guessItem(id: string): Promise<Guess> {
  if (!isId(id)) return { ok: false, error: "No se encontró la cosa." };

  const { supabase, user } = await roomsClient();

  const { data } = await supabase
    .from("rooms_items")
    .select("id,thumb,storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { ok: false, error: "Esa cosa no existe." };

  /* La miniatura primero: ya está en la fila, son 176 px y alcanzan para
     decir si es una camiseta o un pantalón. Solo si no hay se baja la
     grande, que cuesta un viaje al bucket. */
  let image: { base64: string; mimeType: string } | null = null;

  const thumb = String(data.thumb ?? "");
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(thumb);
  if (match) image = { mimeType: match[1], base64: match[2] };

  if (!image && data.storage_path) image = await readPhoto(String(data.storage_path));

  if (!image) return { ok: false, error: "Esta cosa no tiene foto todavía." };

  /* El catálogo entero: las de fábrica, las prendas y las propias de esta
     persona. Si la lista no incluye "Pesca", el modelo nunca va a poder
     acertarle a una caña. */
  const { data: mine } = await supabase
    .from("rooms_categories")
    .select("id,label")
    .eq("user_id", user.id);

  const own = ((mine ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    hue: "#6b7280",
    glyph: "other",
  }));

  const options = [...catalog(own), ...wearCatalog()].map((row) => ({
    key: row.key,
    label: row.label,
  }));

  const read = await readGarment({
    base64: image.base64,
    mimeType: image.mimeType,
    categories: options,
    colors: COLORS.map((row) => ({ key: row.key, label: row.label })),
  });

  if (!read.ok) {
    return {
      ok: false,
      error:
        read.kind === "no_key"
          ? "El reconocimiento por foto no está configurado."
          : "No se pudo leer la foto. Probá con otra.",
    };
  }

  return { ok: true, ...read.guess };
}
