import "server-only";
import { COLORS, catalog, wearCatalog } from "@/lib/rooms";

/**
 * Las listas cerradas que se le pasan al modelo.
 *
 * Tiene que ver TODO lo que esta persona puede elegir, las categorías que se
 * hizo ella incluidas: si "Pesca" no está en la lista, el modelo nunca le va
 * a poder acertar a una caña y va a contestar "other", que es lo mismo que
 * no contestar.
 *
 * Y tiene que ver solo eso. Sin la lista, el modelo devuelve "camiseta de
 * algodón blanca lisa" como categoría y "blanco hueso" como color, y el
 * inventario vuelve a ser texto libre —que es exactamente lo que las claves
 * vinieron a evitar—.
 *
 * Recibe las propias ya consultadas y no el cliente de la base: así la usan
 * igual el panel y el alta, que llegan hasta acá por caminos distintos.
 */
export function catalogFor(own: { id: string; label: string }[]) {
  const mine = own.map((row) => ({
    id: row.id,
    label: row.label,
    hue: "#6b7280",
    glyph: "other",
  }));

  return {
    categories: [...catalog(mine), ...wearCatalog()].map((row) => ({
      key: row.key,
      label: row.label,
    })),
    colors: COLORS.map((row) => ({ key: row.key, label: row.label })),
  };
}

/** Las categorías propias, en crudo, para armar la lista de arriba. */
export function ownRows(data: unknown) {
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    label: String(row.label),
  }));
}
