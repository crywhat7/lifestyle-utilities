import type { Metadata } from "next";
import { placesOf } from "@/lib/rooms";
import { loadAllItems, loadOwnCategories, loadTree, roomsClient } from "../data";
import { MissingMigration } from "../missing";
import { Panel } from "./panel";

export const metadata: Metadata = {
  title: "Panel",
  description: "Todo el inventario de un lado y la ficha del otro, para auditarlo rápido.",
};

/**
 * El panel de escritorio.
 *
 * El resto del módulo está hecho para el pulgar y para el momento de guardar
 * algo: una cosa a la vez, con el objeto en la mano. Esta pantalla es para lo
 * contrario —estar sentado frente a una computadora repasando ciento veinte
 * prendas que ya están guardadas— y por eso es la única con dos columnas, sin
 * botones de guardar y con el teclado como herramienta principal.
 *
 * Todo el inventario se carga de una (ver `loadAllItems`): moverse por la
 * lista tiene que ser instantáneo o la auditoría no se hace.
 */
export default async function PanelPage() {
  const { supabase, user } = await roomsClient();

  const [tree, items, own] = await Promise.all([
    loadTree(supabase, user.id),
    loadAllItems(supabase, user.id),
    loadOwnCategories(supabase, user.id),
  ]);

  if (tree.missing) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-4 pt-8 pb-8">
        <MissingMigration />
      </main>
    );
  }

  return <Panel items={items} nodes={tree.nodes} places={placesOf(tree.nodes)} own={own} />;
}
