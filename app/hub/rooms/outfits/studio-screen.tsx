"use client";

import { useRouter } from "next/navigation";
import type { Garment, Outfit } from "@/lib/rooms";
import { OutfitStudio } from "../outfit-studio";
import { OUTFITS_PATH } from "../paths";

/** El lienzo, en su propia pantalla. Al guardar vuelve a la lista. */
export function StudioScreen({
  wardrobe,
  outfit,
}: {
  wardrobe: Garment[];
  outfit?: Outfit;
}) {
  const router = useRouter();

  return (
    <OutfitStudio
      wardrobe={wardrobe}
      outfit={outfit}
      onDone={() => {
        router.push(OUTFITS_PATH);
        router.refresh();
      }}
    />
  );
}
