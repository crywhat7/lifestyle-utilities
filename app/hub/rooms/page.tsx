import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, Spark } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { ROOM_COLORS, countsByNode, placesOf } from "@/lib/rooms";
import { Board } from "./board";
import { loadIndex, loadTree, roomsClient } from "./data";
import { MissingMigration } from "./missing";
import { OUTFITS_PATH } from "./paths";
import { Search } from "./search";

export const metadata: Metadata = {
  title: "Rooms Planning",
  description:
    "Tus cuartos, tus muebles y cada gaveta con lo que hay dentro. Guardás una vez y después solo buscás.",
};

export default async function RoomsPage() {
  const { supabase, user } = await roomsClient();

  /*
    Las dos consultas salen juntas: ninguna necesita el resultado de la otra.
    El árbol da las habitaciones y el índice da el buscador y los conteos, y
    encadenarlas era pagar dos viajes a Supabase para pintar la portada.
  */
  const [tree, index] = await Promise.all([
    loadTree(supabase, user.id),
    loadIndex(supabase, user.id),
  ]);

  const shell =
    "relative flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]";

  if (tree.missing) {
    return (
      <main className={shell}>
        <Header />
        <MissingMigration />
      </main>
    );
  }

  const rooms = tree.nodes.filter((node) => node.parent_id === null);
  const counts = countsByNode(tree.nodes, index);

  // Lo que hay en toda la casa. Es la única cifra de la portada porque es la
  // única que contesta algo: cuánto de lo que tengo está realmente anotado.
  const total = index.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <main className={shell}>
      <Header />

      <section className="r-rise" style={{ "--d": "40ms" } as CSSProperties}>
        <h1 className="r-title">Tus cuartos</h1>
        <p className="mt-1.5 text-[0.9375rem] text-[var(--r-ink-2)]">
          {rooms.length === 0 ? "Creá el primero y empezá a llenarlo." : summary(total, rooms.length)}
        </p>
      </section>

      {/* El buscador solo aparece cuando hay algo que buscar: en un inventario
          vacío es un campo que no puede contestar nada. */}
      {index.length > 0 ? (
        <div className="r-rise" style={{ "--d": "80ms" } as CSSProperties}>
          <Search index={index} nodes={tree.nodes} />
        </div>
      ) : null}

      <Board
        node={null}
        /* En la raíz cada habitación trae su color; este es solo el que usa lo
           que todavía no tiene uno. */
        tone={ROOM_COLORS[0]}
        childNodes={rooms}
        items={[]}
        counts={Object.fromEntries(counts)}
        places={placesOf(tree.nodes)}
        usedColors={rooms.map((room) => room.color).filter((color): color is string => Boolean(color))}
      />
    </main>
  );
}

/**
 * La línea de abajo del titular.
 *
 * Se arma entera y no pegando trozos, porque en castellano el participio
 * concuerda: "1 cosa guardada", "3 cosas guardadas" y, con el inventario
 * vacío, ni siquiera es la misma frase. Interpolar un número adentro de una
 * plantilla fija es lo que produce "Nada guardadas en 1 habitación".
 */
function summary(total: number, rooms: number) {
  const where = rooms === 1 ? "1 habitación" : `${rooms} habitaciones`;

  if (total === 0) return `Nada guardado todavía en ${where}.`;
  if (total === 1) return `1 cosa guardada en ${where}.`;

  return `${total} cosas guardadas en ${where}.`;
}

function Header() {
  return (
    <header
      className="r-rise flex items-center justify-between gap-2"
      style={{ "--d": "0ms" } as CSSProperties}
    >
      <NavLink href="/hub" className="r-key h-11 min-h-11 gap-2 pr-5 pl-4 text-[0.875rem]">
        <ArrowBack className="size-4" />
        Hub
      </NavLink>

      <NavLink
        href={OUTFITS_PATH}
        className="r-key h-11 min-h-11 gap-2 pr-5 pl-4 text-[0.875rem]"
        style={{ "--tone": "#d6456f" } as CSSProperties}
      >
        <Spark className="size-4" />
        Outfits
      </NavLink>
    </header>
  );
}
