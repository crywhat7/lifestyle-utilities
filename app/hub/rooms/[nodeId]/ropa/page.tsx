import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { branchTone, placesOf } from "@/lib/rooms";
import { loadCategoryUse, loadOwnCategories, loadTree, nodePath, roomsClient } from "../../data";
import { FormShell } from "../../form-shell";
import { ItemScreen } from "../../screens";

export const metadata: Metadata = { title: "Agregar ropa" };

/**
 * El alta de una prenda.
 *
 * Es la misma pantalla que la de una cosa con otra primera pregunta, y por eso
 * no comparte dirección: lo que cambia es la grilla del primer paso —trece
 * clases de prenda en vez de las veintidós categorías de la casa— y eso se
 * decide antes del primer toque, no con un selector adentro del formulario.
 *
 * Vive en todos los nodos y no solo en los armarios a propósito: la ropa
 * también está en una maleta, en una caja de invierno y en el respaldo de una
 * silla, y preguntarle a la app dónde se permite guardar ropa sería inventar
 * una regla que la casa no tiene.
 */
export default async function NewWearPage({ params }: PageProps<"/hub/rooms/[nodeId]/ropa">) {
  const { nodeId } = await params;
  const { supabase, user } = await roomsClient();
  const [tree, own, use] = await Promise.all([
    loadTree(supabase, user.id),
    loadOwnCategories(supabase, user.id),
    loadCategoryUse(supabase, user.id),
  ]);

  const node = tree.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) notFound();

  return (
    <FormShell
      back={nodePath(node.id)}
      backLabel={node.name}
      eyebrow="Agregar ropa"
      title={`En ${node.name}`}
      tone={branchTone(node, tree.nodes)}
    >
      <ItemScreen
        nodeId={node.id}
        places={placesOf(tree.nodes)}
        own={own}
        use={use}
        mode="wear"
        back={nodePath(node.id)}
      />
    </FormShell>
  );
}
