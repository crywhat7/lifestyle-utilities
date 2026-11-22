import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { branchTone, placesOf } from "@/lib/rooms";
import { loadCategoryUse, loadOwnCategories, loadTree, nodePath, roomsClient } from "../../data";
import { FormShell } from "../../form-shell";
import { ItemScreen } from "../../screens";

export const metadata: Metadata = { title: "Agregar cosa" };

export default async function NewItemPage({ params }: PageProps<"/hub/rooms/[nodeId]/cosa">) {
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
      eyebrow="Agregar cosa"
      title={`En ${node.name}`}
      tone={branchTone(node, tree.nodes)}
    >
      <ItemScreen
        nodeId={node.id}
        places={placesOf(tree.nodes)}
        own={own}
        use={use}
        back={nodePath(node.id)}
      />
    </FormShell>
  );
}
