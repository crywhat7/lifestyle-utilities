import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Las fotos de las cosas.
 *
 * El bucket es privado: una camisa colgada en un armario es información de
 * dónde vive alguien, no una imagen de catálogo. Nada se sirve por URL
 * pública; cada vista firma un enlace que caduca.
 *
 * Y acá va la diferencia con Canvas Studio, que usa el cliente de la persona
 * y se apoya en políticas de `storage.objects`: esas políticas son DDL y solo
 * se pueden crear desde el SQL Editor. Este módulo usa el cliente admin, que
 * se salta RLS, y por eso la regla de oro es que **la ruta la arma el
 * servidor, nunca el cliente**: `<user_id>/<item_id>.jpg`, con el user_id de
 * la sesión y el item verificado como propio antes de tocar nada. Si la ruta
 * viniera en el formulario, cualquiera podría escribir en la carpeta de otro.
 */

export const BUCKET = "rooms-items";

/** La única forma válida de nombrar el objeto de un ítem. */
export function photoPath(userId: string, itemId: string) {
  return `${userId}/${itemId}.jpg`;
}

/**
 * El recorte vive al lado del original, no en su lugar.
 *
 * Quitar el fondo se puede reintentar, y un recorte que salió mal —media
 * manga comida, el cuello recortado— no puede costar la foto. Son dos
 * objetos y dos columnas.
 */
export function cutoutPath(userId: string, itemId: string) {
  return `${userId}/${itemId}-recorte.png`;
}

/**
 * La foto de un contenedor vive en la misma carpeta que las de las cosas,
 * con un prefijo que las separa. Un armario y un cable pueden tener el mismo
 * id —son tablas distintas— y sin el prefijo uno pisaría al otro.
 */
export function nodePhotoPath(userId: string, nodeId: string) {
  return `${userId}/mueble-${nodeId}.jpg`;
}

export async function putNodePhoto(userId: string, nodeId: string, file: File) {
  const admin = createAdminClient();
  const path = nodePhotoPath(userId, nodeId);

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (error) return null;
  return path;
}

export async function dropNodePhoto(userId: string, nodeId: string) {
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([nodePhotoPath(userId, nodeId)]);
}

/**
 * La lámina de un póster. Mismo bucket, otro prefijo: los tres tipos de foto
 * —cosa, contenedor y póster— pueden compartir id sin pisarse.
 */
export function propPhotoPath(userId: string, propId: string) {
  return `${userId}/poster-${propId}.jpg`;
}

export async function putPropPhoto(userId: string, propId: string, file: File) {
  const admin = createAdminClient();
  const path = propPhotoPath(userId, propId);

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (error) return null;
  return path;
}

export async function dropPropPhoto(userId: string, propId: string) {
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([propPhotoPath(userId, propId)]);
}

/** Sube —o reemplaza— la foto de un ítem. Devuelve la ruta guardada. */
export async function putPhoto(userId: string, itemId: string, file: File) {
  const admin = createAdminClient();
  const path = photoPath(userId, itemId);

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (error) return null;
  return path;
}

/** Sube el recorte sin fondo. Devuelve la ruta guardada. */
export async function putCutout(userId: string, itemId: string, file: File) {
  const admin = createAdminClient();
  const path = cutoutPath(userId, itemId);

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: "image/png",
    upsert: true,
  });

  if (error) return null;
  return path;
}

/** Al sacar la foto se va también el recorte: sin original no hay recorte. */
export async function dropPhoto(userId: string, itemId: string) {
  const admin = createAdminClient();
  await admin.storage
    .from(BUCKET)
    .remove([photoPath(userId, itemId), cutoutPath(userId, itemId)]);
}

/**
 * Enlaces firmados para un puñado de rutas, en una sola llamada.
 *
 * Una hora de vigencia: lo que dura mirar un cajón, no lo que dura un enlace
 * que alguien reenvía. Firmar de a una por ítem sería una petición por fila.
 */
export async function signPhotos(paths: string[]) {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const admin = createAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }

  return signed;
}
