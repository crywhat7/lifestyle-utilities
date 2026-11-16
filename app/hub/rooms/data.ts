import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
  ITEM_COLUMNS,
  NODE_COLUMNS,
  type Item,
  type RoomNode,
} from "@/lib/rooms";
import { createClient } from "@/lib/supabase/server";

// Las direcciones viven en `paths.ts` porque también las necesita el cliente,
// y este archivo es `server-only`. Se reexportan para que el servidor las
// pida de un solo lugar.
export { ROOMS_PATH, nodePath } from "./paths";

/**
 * El cliente y la persona, sin salir a la red.
 *
 * La sesión ya la verificó el proxy en esta misma petición, así que esto
 * permite disparar las consultas de la pantalla en paralelo en vez de
 * encadenarlas detrás de la identidad.
 */
export async function roomsClient() {
  const user = await currentUser();
  if (!user) redirect("/");

  return { supabase: await createClient("lifestyle_utilities"), user };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * El árbol entero de una persona, de una sola consulta.
 *
 * Suena a demasiado y es lo contrario. Un inventario personal son decenas de
 * nodos —cuartos, muebles, gavetas, cajas—, no miles: traerlos todos cuesta
 * una consulta y resuelve de golpe tres cosas que si no serían una consulta
 * cada una: los hijos de esta pantalla, la ruta para la migaja, y el conteo
 * de lo que cuelga de cada tarjeta.
 *
 * La alternativa era pedir los hijos por nivel y una suma recursiva por
 * tarjeta, o sea una consulta por cada cosa dibujada.
 *
 * `missing` distingue "todavía no creaste nada" de "la migración 0018 no se
 * corrió": lo primero es una pantalla vacía que invita, lo segundo es un
 * aviso para quien administra la base, y confundirlos deja a la persona
 * tocando un botón que nunca va a guardar.
 */
export async function loadTree(client: Client, userId: string) {
  const { data, error } = await client
    .from("rooms_nodes")
    .select(NODE_COLUMNS)
    .eq("user_id", userId);

  if (error) return { nodes: [] as RoomNode[], missing: true };

  return {
    nodes: ((data ?? []) as Record<string, unknown>[]).map(
      (row) =>
        ({
          ...row,
          quantity: Number(row.quantity),
          sort_order: Number(row.sort_order),
          depth: Number(row.depth),
          path: (row.path as string[] | null) ?? [],
          path_ids: (row.path_ids as string[] | null) ?? [],
        }) as RoomNode
    ),
    missing: false,
  };
}

/**
 * Solo las cantidades, para contar.
 *
 * Dos columnas de cada ítem del inventario. No trae nombres ni notas ni
 * miniaturas porque nada de eso se dibuja: lo único que necesita la pantalla
 * de un cuarto es "en este mueble hay 34 cosas", y pedirlo así hace que la
 * consulta pese lo mismo con veinte ítems que con dos mil.
 */
export async function loadTallies(client: Client, userId: string) {
  const { data } = await client
    .from("rooms_items")
    .select("node_id,quantity")
    .eq("user_id", userId);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    node_id: String(row.node_id),
    quantity: Number(row.quantity),
  }));
}

/** Las cosas que están en este nodo exacto, lo último arriba. */
export async function loadItems(client: Client, userId: string, nodeId: string) {
  const { data } = await client
    .from("rooms_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        ...row,
        quantity: Number(row.quantity),
      }) as Item
  );
}
