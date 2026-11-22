import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { categoryOf } from "@/lib/rooms";
import { ROOMS_PATH, loadIndex, loadOwnCategories, loadTree, roomsClient } from "../../data";
import { trailPath } from "../../paths";
import { Trail } from "../../trail";
import { ShareTrail } from "./share";

export const metadata: Metadata = {
  title: "Cómo llegar",
  description: "El camino hasta una cosa, en fotos.",
};

/**
 * Cómo llegar a una cosa, con dirección propia.
 *
 * Antes esto era una hoja que subía desde el buscador. Es justamente lo que
 * uno quiere mandarle a alguien —"mirá, está acá"—, así que tener su propia
 * dirección no es una mejora de navegación: es la función.
 */
export default async function TrailPage({ params }: PageProps<"/hub/rooms/ruta/[itemId]">) {
  const { itemId } = await params;
  const { supabase, user } = await roomsClient();

  const [tree, index, own] = await Promise.all([
    loadTree(supabase, user.id),
    loadIndex(supabase, user.id),
    loadOwnCategories(supabase, user.id),
  ]);

  const item = index.find((candidate) => candidate.id === itemId);
  if (!item) notFound();

  return (
    <main
      className="relative flex flex-1 flex-col gap-4 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
      style={{ "--tone": categoryOf(item.category, own).hue } as CSSProperties}
    >
      <header className="r-rise flex items-center" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={ROOMS_PATH} className="r-key h-11 min-h-11 gap-2 pr-5 pl-4 text-[0.875rem]">
          <ArrowBack className="size-4" />
          Cuartos
        </NavLink>
      </header>

      <Trail item={item} nodes={tree.nodes} own={own} />

      <ShareTrail item={item.name} pdf={`${trailPath(item.id)}/pdf`} />
    </main>
  );
}
