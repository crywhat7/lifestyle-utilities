import type { Metadata } from "next";
import { loadOutfits, loadWardrobe, roomsClient } from "../../data";
import { FormShell } from "../../form-shell";
import { OUTFITS_PATH } from "../../paths";
import { StudioScreen } from "../studio-screen";

export const metadata: Metadata = { title: "Armar un conjunto" };

export default async function NewOutfitPage() {
  const { supabase, user } = await roomsClient();
  const [wardrobe] = await Promise.all([
    loadWardrobe(supabase, user.id),
    loadOutfits(supabase, user.id),
  ]);

  return (
    <FormShell
      back={OUTFITS_PATH}
      backLabel="Outfits"
      eyebrow="Armar"
      title="Un conjunto"
      tone="#d6456f"
    >
      <StudioScreen wardrobe={wardrobe} />
    </FormShell>
  );
}
