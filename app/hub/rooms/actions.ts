"use server";

import { revalidatePath } from "next/cache";
import {
  isCategory,
  isColor,
  isCondition,
  isNodeKind,
  isSlot,
  isVariant,
  nextColor,
  type NodeKind,
} from "@/lib/rooms";
import { roomsClient } from "./data";
import { OUTFITS_PATH, ROOMS_PATH, nodePath } from "./paths";
import { dropNodePhoto, dropPhoto, putCutout, putNodePhoto, putPhoto } from "./storage";

/*
   El estado de un formulario. Solo el TIPO sale de este archivo: un módulo
   `"use server"` puede exportar funciones async y nada más, así que el valor
   inicial vive del lado del cliente, en `forms.tsx`. Exportarlo desde acá
   compila sin una queja y revienta al evaluar el módulo, con la primera
   acción que alguien dispare.
*/
export type FormState =
  /* `id` solo lo llena `createItem`, y existe para el alta en cadena: sin el
     id de lo recién guardado no hay "deshacer", y sin deshacer nadie escribe
     rápido —se escribe con cuidado, que es justo lo contrario de lo que se
     necesita cuando faltan trescientos objetos. */
  | { status: "idle" | "saved"; error?: string; id?: string }
  | { status: "error"; error: string };

const MIGRATION_ERROR = "Falta correr la migración 0018 de Rooms en Supabase.";

/**
 * Qué pantallas rehacer después de escribir.
 *
 * Siempre las dos: la del nodo que se tocó y la raíz. La raíz muestra el
 * conteo de cada habitación, así que agregar un clip en una gaveta del tercer
 * nivel también cambia el número de la portada.
 */
function refresh(nodeId?: string | null) {
  revalidatePath(ROOMS_PATH);
  if (nodeId) revalidatePath(nodePath(nodeId));
}

function toText(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function toQuantity(value: FormDataEntryValue | null, max: number) {
  const parsed = Number(String(value ?? "1").replace(",", "."));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

/**
 * Lo que Postgres contestó, dicho en castellano.
 *
 * Los dos errores que la persona puede provocar de verdad son el de tabla que
 * no existe (la migración sin correr) y el de la jerarquía que levanta el
 * trigger. El resto es un fallo nuestro y no tiene traducción útil: decir
 * "algo salió mal" es más honesto que inventar una causa.
 */
function explain(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") {
    return MIGRATION_ERROR;
  }
  // El trigger `rooms_sync_path` habla en español y dice exactamente qué pasó.
  if (error.code === "P0001" && error.message) return error.message;
  return "No se pudo guardar. Probá de nuevo.";
}

/* -------------------------------------------------------------------------- */
/* Los nodos                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Crear una habitación, un mueble, una gaveta o una caja.
 *
 * Una sola acción para los cuatro porque es una sola fila y un solo
 * formulario: lo que cambia entre crear un armario y crear una bolsa es la
 * lista de tipos del selector, no lo que pasa al guardar.
 *
 * La jerarquía NO se valida acá: la valida el trigger de la 0018, que es el
 * único que ve la fila del padre y no se puede saltear desde la consola.
 * Acá solo se limpia lo que llegó.
 */
export async function createNode(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await roomsClient();

  const kindRaw = form.get("kind");
  if (!isNodeKind(kindRaw)) return { status: "error", error: "Tipo desconocido." };
  const kind: NodeKind = kindRaw;

  const name = toText(form.get("name"), 60);
  if (!name) return { status: "error", error: "Ponele un nombre." };

  const parentRaw = toText(form.get("parent_id"), 40);
  const parentId = kind === "room" ? null : parentRaw || null;
  if (kind !== "room" && !parentId) {
    return { status: "error", error: "Falta decir dónde va." };
  }

  const variant = form.get("variant");
  const color = form.get("color");

  /*
     El color de una habitación nueva no se pregunta si no vino: se le da el
     siguiente de la paleta que no esté usado. Un selector de color en el
     formulario de "crear cuarto" es una decisión más antes de empezar, y
     ninguna habitación necesita ser de un color en particular.
  */
  let fallbackColor: string | null = null;
  if (kind === "room" && !isColor(color)) {
    const { data: rooms } = await supabase
      .from("rooms_nodes")
      .select("color")
      .eq("user_id", user.id)
      .is("parent_id", null);

    fallbackColor = nextColor(((rooms ?? []) as { color: string | null }[]).map((row) => row.color));
  }

  const { data, error } = await supabase
    .from("rooms_nodes")
    .insert({
      user_id: user.id,
      parent_id: parentId,
      kind,
      name,
      variant: isVariant(kind, variant) ? variant : null,
      note: toText(form.get("note"), 280) || null,
      quantity: toQuantity(form.get("quantity"), 999),
      color: isColor(color) ? color : fallbackColor,
    })
    .select("id")
    .maybeSingle();

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  /* La foto se sube DESPUÉS de insertar porque el nombre del objeto lleva el
     id, y ese id lo genera la base. Si la subida falla, el mueble ya quedó
     guardado: perder la foto es molesto, perder el mueble es peor. */
  const newId = data?.id ? String(data.id) : null;
  if (newId) {
    const photo = await attachNodePhoto(user.id, newId, form);
    if (photo) {
      await supabase.from("rooms_nodes").update(photo).eq("id", newId).eq("user_id", user.id);
    }
  }

  refresh(parentId);
  // Una habitación recién creada está vacía y lo siguiente es llenarla, así
  // que su propia pantalla también tiene que quedar fresca.
  if (newId) refresh(newId);

  return { status: "saved" };
}

/** Renombrar, cambiar el tipo, la nota, la cantidad o el color. */
export async function updateNode(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await roomsClient();

  const id = toText(form.get("id"), 40);
  const kindRaw = form.get("kind");
  if (!id || !isNodeKind(kindRaw)) return { status: "error", error: "Tipo desconocido." };

  const name = toText(form.get("name"), 60);
  if (!name) return { status: "error", error: "Ponele un nombre." };

  const color = form.get("color");
  const variant = form.get("variant");

  const photo = await attachNodePhoto(user.id, id, form);

  const { data, error } = await supabase
    .from("rooms_nodes")
    .update({
      ...(photo ?? {}),
      name,
      variant: isVariant(kindRaw, variant) ? variant : null,
      note: toText(form.get("note"), 280) || null,
      quantity: toQuantity(form.get("quantity"), 999),
      ...(isColor(color) ? { color } : {}),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("parent_id")
    .maybeSingle();

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  refresh(id);
  refresh((data as { parent_id: string | null } | null)?.parent_id ?? null);

  return { status: "saved" };
}

/**
 * Tirar un nodo con todo lo que tiene dentro.
 *
 * El `on delete cascade` de la 0018 se lleva la rama entera y los ítems de
 * cada nivel. Es destructivo y no se puede deshacer, así que quien lo llama
 * tiene que haber confirmado antes, diciendo cuántas cosas se van.
 */
export async function deleteNode(id: string, parentId: string | null) {
  const { supabase, user } = await roomsClient();

  await supabase.from("rooms_nodes").delete().eq("id", id).eq("user_id", user.id);

  refresh(parentId);
}

/* -------------------------------------------------------------------------- */
/* Las fotos                                                                   */
/* -------------------------------------------------------------------------- */

/** Lo más grande que aceptamos. El navegador ya la achicó a ~1280 px. */
const MAX_PHOTO = 6 * 1024 * 1024;

/**
 * Guardar la foto que vino con el formulario, si vino alguna.
 *
 * La ruta del objeto NO se lee del formulario: la arma el servidor con el
 * user_id de la sesión y el id del ítem. Es la defensa que reemplaza a las
 * políticas de `storage.objects`, porque este módulo sube con el cliente
 * admin —que se salta RLS— y una ruta de origen desconocido sería permiso
 * para escribir en la carpeta de cualquiera.
 *
 * La miniatura viaja aparte y es la que pinta las listas: son unos KB dentro
 * de la propia fila, así que una lista de cuarenta cosas no dispara cuarenta
 * descargas firmadas.
 */
async function attachPhoto(
  userId: string,
  itemId: string,
  form: FormData
): Promise<{ storage_path?: string; thumb?: string } | null> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PHOTO || !file.type.startsWith("image/")) return null;

  const path = await putPhoto(userId, itemId, file);
  if (!path) return null;

  const thumb = toText(form.get("thumb"), 60000);

  return { storage_path: path, ...(thumb.startsWith("data:image/") ? { thumb } : {}) };
}

/**
 * Guardar la foto de un contenedor, si vino alguna.
 *
 * Misma defensa que con las cosas: la ruta del objeto la arma el servidor
 * con el user_id de la sesión, nunca el formulario. Acá importa el doble,
 * porque un armario y un cable pueden tener el mismo id —son tablas
 * distintas— y el prefijo del nombre es lo que impide que uno pise al otro.
 */
async function attachNodePhoto(
  userId: string,
  nodeId: string,
  form: FormData
): Promise<{ storage_path?: string; thumb?: string } | null> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PHOTO || !file.type.startsWith("image/")) return null;

  const path = await putNodePhoto(userId, nodeId, file);
  if (!path) return null;

  const thumb = toText(form.get("thumb"), 24000);

  return { storage_path: path, ...(thumb.startsWith("data:image/") ? { thumb } : {}) };
}

/** Sacarle la foto a un contenedor. */
export async function removeNodePhoto(nodeId: string, parentId: string | null) {
  const { supabase, user } = await roomsClient();

  const { data } = await supabase
    .from("rooms_nodes")
    .select("id")
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return;

  await dropNodePhoto(user.id, nodeId);
  await supabase
    .from("rooms_nodes")
    .update({ storage_path: null, thumb: null })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  refresh(nodeId);
  refresh(parentId);
}

/** Sacarle la foto a una cosa: el objeto del bucket y las dos columnas. */
export async function removeItemPhoto(itemId: string, nodeId: string) {
  const { supabase, user } = await roomsClient();

  const { data } = await supabase
    .from("rooms_items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return;

  await dropPhoto(user.id, itemId);
  await supabase
    .from("rooms_items")
    .update({ storage_path: null, thumb: null, cutout_path: null })
    .eq("id", itemId)
    .eq("user_id", user.id);

  refresh(nodeId);
}

/**
 * Guardar la prenda ya recortada.
 *
 * El recorte lo hizo el navegador —ver `cutout.ts`—, así que acá solo llega
 * un PNG con transparencia. El servidor no lo mira: lo pone al lado del
 * original y anota la ruta.
 */
export async function saveCutout(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await roomsClient();

  const id = toText(form.get("id"), 40);
  const nodeId = toText(form.get("node_id"), 40);
  const file = form.get("cutout");

  if (!id || !(file instanceof File) || file.size === 0) {
    return { status: "error", error: "No llegó el recorte." };
  }
  if (file.size > MAX_PHOTO || file.type !== "image/png") {
    return { status: "error", error: "Ese recorte no sirve." };
  }

  // Que el ítem sea de quien dice serlo: la ruta del objeto se arma con el
  // user_id de la sesión, pero el id del ítem viene del formulario.
  const { data } = await supabase
    .from("rooms_items")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { status: "error", error: "Esa cosa no existe." };

  const path = await putCutout(user.id, id, file);
  if (!path) return { status: "error", error: "No se pudo guardar el recorte." };

  const { error } = await supabase
    .from("rooms_items")
    .update({ cutout_path: path })
    .eq("id", id)
    .eq("user_id", user.id);

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  refresh(nodeId);
  revalidatePath(OUTFITS_PATH);

  return { status: "saved" };
}

/* -------------------------------------------------------------------------- */
/* Los conjuntos                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Guardar un conjunto.
 *
 * El lienzo entero viaja como JSON y se reescribe completo: no hay "mover
 * una prenda" del lado del servidor, hay "así quedó el conjunto". Guardar
 * cada arrastre sería una escritura por gesto para reconstruir, al final,
 * exactamente este mismo objeto.
 *
 * Las prendas se verifican contra el inventario propio antes de guardar: un
 * `item_id` inventado dejaría un conjunto con un hueco que no se puede
 * explicar al abrirlo.
 */
export async function saveOutfit(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await roomsClient();

  const name = toText(form.get("name"), 60);
  if (!name) return { status: "error", error: "Ponele un nombre al conjunto." };

  let pieces: unknown;
  try {
    pieces = JSON.parse(toText(form.get("pieces"), 20000) || "[]");
  } catch {
    return { status: "error", error: "No se entendió el lienzo." };
  }

  if (!Array.isArray(pieces) || pieces.length === 0) {
    return { status: "error", error: "Poné al menos una prenda." };
  }

  const clean = pieces.slice(0, 20).map((piece) => {
    const row = piece as Record<string, unknown>;
    return {
      item_id: String(row.item_id ?? ""),
      /* La ranura es lo que dibuja el maniquí. Si llega una que no existe se
         cae a coordenadas, que es como se guardaban los conjuntos antes y
         sigue siendo un dibujo válido. */
      ...(isSlot(row.slot) ? { slot: row.slot } : {}),
      x: clamp(Number(row.x), 0, 100),
      y: clamp(Number(row.y), 0, 100),
      scale: clamp(Number(row.scale), 0.2, 3),
      rot: clamp(Number(row.rot), -180, 180),
    };
  });

  const ids = [...new Set(clean.map((piece) => piece.item_id))].filter(Boolean);

  const { data: mine } = await supabase
    .from("rooms_items")
    .select("id")
    .eq("user_id", user.id)
    .in("id", ids);

  const owned = new Set(((mine ?? []) as { id: string }[]).map((row) => row.id));
  const kept = clean.filter((piece) => owned.has(piece.item_id));

  if (kept.length === 0) return { status: "error", error: "Ninguna prenda es tuya." };

  const id = toText(form.get("id"), 40);

  const { error } = id
    ? await supabase
        .from("rooms_outfits")
        .update({ name, note: toText(form.get("note"), 280) || null, pieces: kept })
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("rooms_outfits").insert({
        user_id: user.id,
        name,
        note: toText(form.get("note"), 280) || null,
        pieces: kept,
      });

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  revalidatePath(OUTFITS_PATH);
  return { status: "saved" };
}

export async function deleteOutfit(id: string) {
  const { supabase, user } = await roomsClient();

  await supabase.from("rooms_outfits").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath(OUTFITS_PATH);
}

/* -------------------------------------------------------------------------- */
/* Las cosas                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Guardar un objeto.
 *
 * El nombre es lo único obligatorio. Todo lo demás tiene un valor por
 * defecto razonable porque el momento de registrar es con el cajón abierto y
 * las manos ocupadas: si para anotar un cable hay que llenar cinco campos, el
 * cable no se anota y el inventario deja de ser cierto.
 */
export async function createItem(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await roomsClient();

  const nodeId = toText(form.get("node_id"), 40);
  if (!nodeId) return { status: "error", error: "Falta decir dónde está." };

  const name = toText(form.get("name"), 80);
  if (!name) return { status: "error", error: "¿Qué cosa es?" };

  const category = form.get("category");
  const condition = form.get("condition");

  const { data, error } = await supabase
    .from("rooms_items")
    .insert({
      user_id: user.id,
      node_id: nodeId,
      name,
      category: isCategory(category) ? category : "other",
      condition: isCondition(condition) ? condition : "good",
      note: toText(form.get("note"), 400) || null,
      quantity: toQuantity(form.get("quantity"), 9999),
    })
    .select("id")
    .maybeSingle();

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  /*
     La foto se sube DESPUÉS de insertar y no antes, porque el nombre del
     objeto lleva el id del ítem y ese id lo genera la base. Subirla primero
     obligaría a inventar un nombre temporal y a renombrar después, que es dos
     veces el trabajo y una oportunidad de dejar basura en el bucket.

     Si la subida falla, la cosa ya quedó guardada: perder la foto es molesto,
     perder el registro de que el cable existe es peor.
  */
  const itemId = data?.id ? String(data.id) : null;
  if (itemId) {
    const photo = await attachPhoto(user.id, itemId, form);
    if (photo) {
      await supabase.from("rooms_items").update(photo).eq("id", itemId).eq("user_id", user.id);
    }
  }

  refresh(nodeId);
  return { status: "saved", id: itemId ?? undefined };
}

/**
 * Editar un objeto — y moverlo, que es lo mismo.
 *
 * El destino viaja en el mismo formulario y no en una acción aparte: las
 * cosas se mueven de cajón todo el tiempo, y si mover fuera otro flujo
 * —borrar acá, crear allá— nadie lo reflejaría y el inventario dejaría de
 * ser cierto a las dos semanas.
 */
export async function updateItem(_state: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await roomsClient();

  const id = toText(form.get("id"), 40);
  const fromNode = toText(form.get("node_id"), 40);
  if (!id) return { status: "error", error: "No se encontró la cosa." };

  const name = toText(form.get("name"), 80);
  if (!name) return { status: "error", error: "¿Qué cosa es?" };

  const category = form.get("category");
  const condition = form.get("condition");

  /*
     El destino tiene que ser un nodo propio. RLS protege la FILA del ítem
     —nadie puede editar lo que no es suyo—, pero no mira el valor que se
     escribe dentro: sin esta comprobación, un `node_id` inventado mandaría
     la cosa al mueble de otra persona.
  */
  const target = toText(form.get("move_to"), 40) || fromNode;
  let nodeId = fromNode;

  if (target && target !== fromNode) {
    const { data: owned } = await supabase
      .from("rooms_nodes")
      .select("id")
      .eq("id", target)
      .eq("user_id", user.id)
      .maybeSingle();

    if (owned) nodeId = target;
  }

  const photo = await attachPhoto(user.id, id, form);

  const { error } = await supabase
    .from("rooms_items")
    .update({
      ...(photo ?? {}),
      node_id: nodeId,
      name,
      category: isCategory(category) ? category : "other",
      condition: isCondition(condition) ? condition : "good",
      note: toText(form.get("note"), 400) || null,
      quantity: toQuantity(form.get("quantity"), 9999),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  refresh(fromNode);
  if (nodeId !== fromNode) refresh(nodeId);

  return { status: "saved" };
}

export async function deleteItem(id: string, nodeId: string) {
  const { supabase, user } = await roomsClient();

  await supabase.from("rooms_items").delete().eq("id", id).eq("user_id", user.id);

  refresh(nodeId);
}
