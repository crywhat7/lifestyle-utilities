import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { branchTone } from "@/lib/rooms";
import { ROOMS_PATH, loadTree, nodePath, roomsClient } from "../../data";
import { FormShell } from "../../form-shell";
import { NodeScreen } from "../../screens";

export const metadata: Metadata = { title: "Editar" };

export default async function EditNodePage({ params }: PageProps<"/hub/rooms/[nodeId]/editar">) {
  const { nodeId } = await params;
  const { supabase, user } = await roomsClient();
  const tree = await loadTree(supabase, user.id);

  const node = tree.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) notFound();

  /* Al guardar se vuelve a donde el contenedor VIVE, no a su propia
     pantalla: si se lo acaba de borrar, su pantalla ya no existe. */
  const back = node.parent_id ? nodePath(node.parent_id) : ROOMS_PATH;

  const used = tree.nodes
    .filter((candidate) => candidate.parent_id === null && candidate.id !== node.id)
    .map((room) => room.color)
    .filter((color): color is string => Boolean(color));

  return (
    <FormShell
      back={nodePath(node.id)}
      backLabel={node.name}
      eyebrow="Editar"
      title={node.name}
      tone={branchTone(node, tree.nodes)}
    >
      <NodeScreen
        kind={node.kind}
        parentId={node.parent_id}
        node={node}
        usedColors={used}
        back={back}
      />
    </FormShell>
  );
}
