"use server";

import { revalidatePath } from "next/cache";
import {
  isCategory,
  isColor,
  isCondition,
  isNodeKind,
  isVariant,
  nextColor,
  type NodeKind,
} from "@/lib/rooms";
import { roomsClient } from "./data";
import { ROOMS_PATH, nodePath } from "./paths";

/*
   El estado de un formulario. Solo el TIPO sale de este archivo: un módulo
   `"use server"` puede exportar funciones async y nada más, así que el valor
   inicial vive del lado del cliente, en `forms.tsx`. Exportarlo desde acá
   compila sin una queja y revienta al evaluar el módulo, con la primera
   acción que alguien dispare.
*/
export type FormState = { status: "idle" | "saved"; error?: string } | { status: "error"; error: string };

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

  refresh(parentId);
  // Una habitación recién creada está vacía y lo siguiente es llenarla, así
  // que su propia pantalla también tiene que quedar fresca.
  if (data?.id) refresh(String(data.id));

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

  const { data, error } = await supabase
    .from("rooms_nodes")
    .update({
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

  const { error } = await supabase.from("rooms_items").insert({
    user_id: user.id,
    node_id: nodeId,
    name,
    category: isCategory(category) ? category : "other",
    condition: isCondition(condition) ? condition : "good",
    note: toText(form.get("note"), 400) || null,
    quantity: toQuantity(form.get("quantity"), 9999),
  });

  const failure = explain(error);
  if (failure) return { status: "error", error: failure };

  refresh(nodeId);
  return { status: "saved" };
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

  const { error } = await supabase
    .from("rooms_items")
    .update({
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
