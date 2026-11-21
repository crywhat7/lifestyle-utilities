import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { branchTone, placesOf } from "@/lib/rooms";
import { loadItems, loadOwnCategories, loadTree, nodePath, roomsClient } from "../../../data";
import { FormShell } from "../../../form-shell";
import { ItemScreen } from "../../../screens";

export const metadata: Metadata = { title: "La cosa" };

export default async function EditItemPage({
  params,
}: PageProps<"/hub/rooms/[nodeId]/cosa/[itemId]">) {
  const { nodeId, itemId } = await params;
  const { supabase, user } = await roomsClient();

  const [tree, items, own] = await Promise.all([
    loadTree(supabase, user.id),
    loadItems(supabase, user.id, nodeId),
    loadOwnCategories(supabase, user.id),
  ]);

  const node = tree.nodes.find((candidate) => candidate.id === nodeId);
  const item = items.find((candidate) => candidate.id === itemId);
  if (!node || !item) notFound();

  return (
    <FormShell
      back={nodePath(node.id)}
      backLabel={node.name}
      eyebrow="La cosa"
      title={item.name}
      tone={branchTone(node, tree.nodes)}
    >
      <ItemScreen
        nodeId={node.id}
        item={item}
        places={placesOf(tree.nodes)}
        own={own}
        back={nodePath(node.id)}
      />
    </FormShell>
  );
}
