"use client";

import { useRouter } from "next/navigation";
import type { ItemWithPhoto, NodeKind, OwnCategory, RoomNode } from "@/lib/rooms";
import { ItemForm, NodeForm, type Place } from "./forms";

/**
 * Los formularios, puestos en una pantalla propia.
 *
 * `NodeForm` e `ItemForm` no saben nada de navegación: avisan cuando el
 * servidor confirmó y nada más. Antes ese aviso cerraba una hoja modal;
 * ahora vuelve a la pantalla de donde se vino.
 *
 * El `refresh` no sobra: la lista de atrás se renderizó en el servidor antes
 * de este cambio, así que sin él se vuelve a una pantalla que todavía no
 * sabe que acaba de nacer una gaveta.
 */
function useReturn(back: string) {
  const router = useRouter();

  return () => {
    router.push(back);
    router.refresh();
  };
}

export function NodeScreen({
  kind,
  parentId,
  node,
  usedColors,
  back,
}: {
  kind: NodeKind;
  parentId: string | null;
  node?: RoomNode;
  usedColors?: string[];
  back: string;
}) {
  return (
    <NodeForm
      kind={kind}
      parentId={parentId}
      node={node}
      usedColors={usedColors}
      onSaved={useReturn(back)}
    />
  );
}

export function ItemScreen({
  nodeId,
  item,
  places,
  own,
  use,
  mode,
  back,
}: {
  nodeId: string;
  item?: ItemWithPhoto;
  places: Place[];
  own: OwnCategory[];
  /** Cuántas cosas hay en cada categoría, para adelantar las más usadas. */
  use?: Record<string, number>;
  /** "wear" abre el alta con las clases de prenda en vez de las categorías. */
  mode?: "thing" | "wear";
  back: string;
}) {
  return (
    <ItemForm
      nodeId={nodeId}
      item={item}
      places={places}
      own={own}
      use={use}
      mode={mode}
      onSaved={useReturn(back)}
    />
  );
}
