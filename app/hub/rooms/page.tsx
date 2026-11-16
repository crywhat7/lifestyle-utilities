import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { ROOM_COLORS, countsByNode, placesOf } from "@/lib/rooms";
import { Board } from "./board";
import { loadTallies, loadTree, roomsClient } from "./data";
import { MissingMigration } from "./missing";

export const metadata: Metadata = {
  title: "Rooms Planning",
  description:
    "Tus cuartos, tus muebles y cada gaveta con lo que hay dentro. Guardás una vez y después solo buscás.",
};

export default async function RoomsPage() {
  const { supabase, user } = await roomsClient();

  /*
    Las dos consultas salen juntas: ninguna necesita el resultado de la otra.
    El árbol da las habitaciones y las cantidades dan el número de cada una,
    y encadenarlas era pagar dos viajes a Supabase para pintar la portada.
  */
  const [tree, tallies] = await Promise.all([
    loadTree(supabase, user.id),
    loadTallies(supabase, user.id),
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
  const counts = countsByNode(tree.nodes, tallies);

  // Lo que hay en toda la casa. Es la única cifra de la portada porque es la
  // única que contesta algo: cuánto de lo que tengo está realmente anotado.
  const total = tallies.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <main className={shell}>
      <Header />

      <section className="r-rise" style={{ "--d": "40ms" } as CSSProperties}>
        <h1 className="r-title">Tus cuartos</h1>
        <p className="mt-1.5 text-[0.9375rem] text-[var(--r-ink-2)]">
          {rooms.length === 0 ? "Creá el primero y empezá a llenarlo." : summary(total, rooms.length)}
        </p>
      </section>

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
    <header className="r-rise flex items-center" style={{ "--d": "0ms" } as CSSProperties}>
      <NavLink href="/hub" className="r-key h-11 min-h-11 gap-2 pr-5 pl-4 text-[0.875rem]">
        <ArrowBack className="size-4" />
        Hub
      </NavLink>
    </header>
  );
}
