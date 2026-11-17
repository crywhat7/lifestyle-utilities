import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadOutfits, loadWardrobe, roomsClient } from "../../data";
import { FormShell } from "../../form-shell";
import { OUTFITS_PATH } from "../../paths";
import { StudioScreen } from "../studio-screen";

export const metadata: Metadata = { title: "El conjunto" };

export default async function OutfitPage({ params }: PageProps<"/hub/rooms/outfits/[outfitId]">) {
  const { outfitId } = await params;
  const { supabase, user } = await roomsClient();

  const [wardrobe, outfits] = await Promise.all([
    loadWardrobe(supabase, user.id),
    loadOutfits(supabase, user.id),
  ]);

  const outfit = outfits.outfits.find((candidate) => candidate.id === outfitId);
  if (!outfit) notFound();

  return (
    <FormShell
      back={OUTFITS_PATH}
      backLabel="Outfits"
      eyebrow="El conjunto"
      title={outfit.name}
      tone="#d6456f"
    >
      <StudioScreen wardrobe={wardrobe} outfit={outfit} />
    </FormShell>
  );
}
