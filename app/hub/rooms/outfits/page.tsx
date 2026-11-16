import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { ROOMS_PATH, loadOutfits, loadWardrobe, roomsClient } from "../data";
import { MissingMigration } from "../missing";
import { OutfitBoard } from "./outfit-board";

export const metadata: Metadata = {
  title: "Outfits",
  description: "Combiná las prendas que ya tenés y guardá los conjuntos que funcionan.",
};

export default async function OutfitsPage() {
  const { supabase, user } = await roomsClient();

  const [wardrobe, outfits] = await Promise.all([
    loadWardrobe(supabase, user.id),
    loadOutfits(supabase, user.id),
  ]);

  const shell =
    "relative flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]";

  return (
    /* El rosa es el color de la ropa en todo el módulo: el mismo de la
       categoría, para que esta pantalla se sienta parte de lo mismo. */
    <main className={shell} style={{ "--tone": "#d6456f" } as CSSProperties}>
      <header className="r-rise flex items-center" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={ROOMS_PATH} className="r-key h-11 min-h-11 gap-2 pr-5 pl-4 text-[0.875rem]">
          <ArrowBack className="size-4" />
          Cuartos
        </NavLink>
      </header>

      <section className="r-rise" style={{ "--d": "40ms" } as CSSProperties}>
        <h1 className="r-title">Outfits</h1>
        <p className="mt-1.5 text-[0.9375rem] text-[var(--r-ink-2)]">
          {outfits.missing
            ? "Falta un paso para poder guardarlos."
            : "Combiná lo que ya tenés y guardá lo que funciona."}
        </p>
      </section>

      {outfits.missing ? (
        <MissingMigration migration="0019_rooms_outfits.sql" what="Los conjuntos no tienen dónde guardarse." />
      ) : (
        <OutfitBoard outfits={outfits.outfits} wardrobe={wardrobe} />
      )}
    </main>
  );
}
