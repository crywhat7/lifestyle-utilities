import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { branchTone } from "@/lib/rooms";
import { loadTree, nodePath, roomsClient } from "../../data";
import { MissingMigration } from "../../missing";
import { PlanView } from "../../plan-view";

export const metadata: Metadata = {
  title: "El plano",
};

/**
 * El cuarto visto por dentro.
 *
 * Solo las habitaciones tienen plano: un plano de una gaveta no es nada. Si
 * alguien llega acá con el id de un mueble, se lo manda a la pantalla de ese
 * mueble en vez de mostrarle un piso vacío — es a donde quería ir.
 */
export default async function PlanPage({ params }: PageProps<"/hub/rooms/[nodeId]/plano">) {
  const { nodeId } = await params;
  const { supabase, user } = await roomsClient();

  const tree = await loadTree(supabase, user.id);

  const shell =
    "relative flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]";

  if (tree.missing) {
    return (
      <main className={shell}>
        <MissingMigration />
      </main>
    );
  }

  const room = tree.nodes.find((node) => node.id === nodeId);
  if (!room) notFound();
  if (room.kind !== "room") redirect(nodePath(room.id));

  const furniture = tree.nodes.filter(
    (node) => node.parent_id === room.id && node.kind === "furniture"
  );

  const tone = branchTone(room, tree.nodes);

  return (
    <main className={shell} style={{ "--tone": tone } as CSSProperties}>
      <header className="r-rise flex items-center" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink
          href={nodePath(room.id)}
          className="r-key h-11 min-h-11 min-w-0 gap-2 pr-5 pl-4 text-[0.875rem]"
        >
          <ArrowBack className="size-4 shrink-0" />
          <span className="truncate">{room.name}</span>
        </NavLink>
      </header>

      <section className="r-rise" style={{ "--d": "40ms" } as CSSProperties}>
        <h1 className="r-title text-[1.75rem]">El plano</h1>
        <p className="mt-1 text-[0.9375rem] text-[var(--r-ink-2)]">
          Tocá un mueble para ver lo que guarda.
        </p>
      </section>

      <div className="r-rise" style={{ "--d": "80ms" } as CSSProperties}>
        <PlanView room={room} furniture={furniture} tone={tone} />
      </div>
    </main>
  );
}
