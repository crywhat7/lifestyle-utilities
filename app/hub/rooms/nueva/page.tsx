import type { Metadata } from "next";
import { ROOMS_PATH, loadTree, roomsClient } from "../data";
import { FormShell } from "../form-shell";
import { NodeScreen } from "../screens";

export const metadata: Metadata = { title: "Nueva habitación" };

export default async function NewRoomPage() {
  const { supabase, user } = await roomsClient();
  const tree = await loadTree(supabase, user.id);

  const used = tree.nodes
    .filter((node) => node.parent_id === null)
    .map((room) => room.color)
    .filter((color): color is string => Boolean(color));

  return (
    <FormShell back={ROOMS_PATH} backLabel="Cuartos" eyebrow="Nueva" title="Una habitación">
      <NodeScreen kind="room" parentId={null} usedColors={used} back={ROOMS_PATH} />
    </FormShell>
  );
}
