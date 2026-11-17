import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
  ITEM_COLUMNS,
  NODE_COLUMNS,
  type Item,
  type IndexEntry,
  type Outfit,
  type RoomNode,
} from "@/lib/rooms";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "./storage";

// Las direcciones viven en `paths.ts` porque también las necesita el cliente,
// y este archivo es `server-only`. Se reexportan para que el servidor las
// pida de un solo lugar.
export { ROOMS_PATH, OUTFITS_PATH, nodePath } from "./paths";

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

  const rows = ((data ?? []) as Record<string, unknown>[]);

  /* Las fotos de los contenedores se firman en lote. Son pocas —un cuarto
     tiene decenas de muebles, no miles— y tenerlas firmadas de entrada es lo
     que permite abrir la ruta de búsqueda sin un viaje más. */
  const signed = await signPhotos(
    rows.map((row) => row.storage_path).filter((path): path is string => Boolean(path))
  );

  return {
    nodes: rows.map(
      (row) =>
        ({
          ...row,
          quantity: Number(row.quantity),
          sort_order: Number(row.sort_order),
          depth: Number(row.depth),
          grid_x: row.grid_x === null ? null : Number(row.grid_x),
          grid_y: row.grid_y === null ? null : Number(row.grid_y),
          grid_w: row.grid_w === null ? null : Number(row.grid_w),
          grid_h: row.grid_h === null ? null : Number(row.grid_h),
          rotation: Number(row.rotation ?? 0),
          terrain: (row.terrain as string | null) ?? null,
          path: (row.path as string[] | null) ?? [],
          path_ids: (row.path_ids as string[] | null) ?? [],
          photo: row.storage_path ? (signed.get(String(row.storage_path)) ?? null) : null,
        }) as RoomNode
    ),
    missing: false,
  };
}

/**
 * El inventario entero, en su versión liviana.
 *
 * Cinco columnas de cada cosa. Sin notas, sin miniaturas y sin fotos: con
 * esto se resuelven las dos cosas que necesita la portada —cuánto hay en cada
 * rama y el buscador— y la consulta pesa lo mismo con veinte ítems que con
 * dos mil.
 *
 * Que el buscador filtre sobre esta lista y no sobre la base es deliberado:
 * escribir "cable" responde en la misma tecla, sin un viaje de red por
 * pulsación. Es lo que vuelve el buscador instantáneo de verdad.
 */
export async function loadIndex(client: Client, userId: string) {
  const { data } = await client
    .from("rooms_items")
    .select("id,node_id,name,category,condition,quantity")
    .eq("user_id", userId);

  return ((data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        ...row,
        quantity: Number(row.quantity),
      }) as IndexEntry
  );
}

/**
 * Las cosas que están en este nodo exacto, lo último arriba.
 *
 * Las fotos se firman en lote: el bucket es privado, así que cada imagen
 * necesita un enlace temporal, y pedirlos de a uno sería una petición por
 * fila. La miniatura no necesita nada de esto —viaja dentro de la propia
 * fila— y es la que pinta la lista al instante.
 */
export async function loadItems(client: Client, userId: string, nodeId: string) {
  const { data } = await client
    .from("rooms_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        ...row,
        quantity: Number(row.quantity),
      }) as Item
  );

  const paths = rows.flatMap((row) =>
    [row.storage_path, row.cutout_path].filter((path): path is string => Boolean(path))
  );

  const signed = await signPhotos(paths);

  return rows.map((row) => ({
    ...row,
    photo: row.storage_path ? (signed.get(row.storage_path) ?? null) : null,
    cutout: row.cutout_path ? (signed.get(row.cutout_path) ?? null) : null,
  }));
}

/**
 * Las prendas con el fondo ya quitado, para el armador de conjuntos.
 *
 * Solo las que tienen recorte: una prenda con foto pero sin recortar no se
 * puede combinar —el fondo del cuarto detrás de la camisa arruina el
 * conjunto—, y mostrarla igual sería ofrecer algo que no se puede usar.
 */
export async function loadWardrobe(client: Client, userId: string) {
  const { data } = await client
    .from("rooms_items")
    .select("id,node_id,name,category,condition,quantity,thumb,cutout_path")
    .eq("user_id", userId)
    .not("cutout_path", "is", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Record<string, unknown>[];
  const signed = await signPhotos(
    rows.map((row) => String(row.cutout_path)).filter(Boolean)
  );

  return rows.map((row) => ({
    id: String(row.id),
    node_id: String(row.node_id),
    name: String(row.name),
    category: String(row.category),
    cutout: signed.get(String(row.cutout_path)) ?? null,
  }));
}

/** Los conjuntos guardados, el último arriba. */
export async function loadOutfits(client: Client, userId: string) {
  const { data, error } = await client
    .from("rooms_outfits")
    .select("id,name,note,pieces,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { outfits: [] as Outfit[], missing: true };

  return {
    outfits: ((data ?? []) as Record<string, unknown>[]).map(
      (row) =>
        ({
          ...row,
          pieces: Array.isArray(row.pieces) ? row.pieces : [],
        }) as Outfit
    ),
    missing: false,
  };
}
