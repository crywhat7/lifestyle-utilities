import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  KIND_LABEL,
  branchTone,
  countLabel,
  countsByNode,
  pathLabel,
  variantLabel,
} from "@/lib/rooms";
import { Board } from "../board";
import {
  ROOMS_PATH,
  loadIndex,
  loadItems,
  loadOwnCategories,
  loadTree,
  nodePath,
  roomsClient,
} from "../data";
import { Glyph, NodeGlyph } from "../glyph";
import { MissingMigration } from "../missing";

export const metadata: Metadata = {
  title: "Rooms Planning",
};

export default async function NodePage({ params }: PageProps<"/hub/rooms/[nodeId]">) {
  const { nodeId } = await params;
  const { supabase, user } = await roomsClient();

  /*
    Tres consultas juntas. `loadItems` ya sabe su `nodeId` desde la URL, así
    que no tiene que esperar al árbol: encadenarlas sería pedirle a la
    pantalla de una gaveta tres viajes en fila para dibujar una lista.
  */
  const [tree, index, items, own] = await Promise.all([
    loadTree(supabase, user.id),
    loadIndex(supabase, user.id),
    loadItems(supabase, user.id, nodeId),
    loadOwnCategories(supabase, user.id),
  ]);

  const shell =
    "relative flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]";

  if (tree.missing) {
    return (
      <main className={shell}>
        <NavLink href={ROOMS_PATH} className="r-key h-11 min-h-11 gap-2 pr-5 pl-4 text-[0.875rem]">
          <ArrowBack className="size-4" />
          Cuartos
        </NavLink>
        <MissingMigration />
      </main>
    );
  }

  const node = tree.nodes.find((candidate) => candidate.id === nodeId);

  // RLS ya garantiza que solo vuelven nodos propios, así que "no está en el
  // árbol" y "no existe" son lo mismo desde acá.
  if (!node) notFound();

  const children = tree.nodes.filter((candidate) => candidate.parent_id === node.id);
  const counts = countsByNode(tree.nodes, index);
  const tone = branchTone(node, tree.nodes);

  const back = node.parent_id ? nodePath(node.parent_id) : ROOMS_PATH;
  const backLabel = node.parent_id
    ? (tree.nodes.find((candidate) => candidate.id === node.parent_id)?.name ?? "Atrás")
    : "Cuartos";

  const kind = variantLabel(node.kind, node.variant) ?? KIND_LABEL[node.kind].one;
  const copies = node.quantity > 1 ? `${node.quantity} iguales` : null;

  return (
    <main className={shell} style={{ "--tone": tone } as CSSProperties}>
      <header
        className="r-rise flex items-center justify-between gap-2"
        style={{ "--d": "0ms" } as CSSProperties}
      >
        <NavLink
          href={back}
          className="r-key h-11 min-h-11 min-w-0 gap-2 pr-5 pl-4 text-[0.875rem]"
        >
          <ArrowBack className="size-4 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </NavLink>

      </header>

      <section className="r-rise flex items-start gap-3.5" style={{ "--d": "40ms" } as CSSProperties}>
        <Glyph tone={tone}>
          <NodeGlyph kind={node.kind} variant={node.variant} />
        </Glyph>

        <div className="min-w-0 flex-1">
          {/* La ruta sin el último tramo: el nombre propio ya es el titular,
              y repetirlo al final del camino es ruido. */}
          {node.depth > 1 ? (
            <p className="r-crumb">{pathLabel(node.path, { skipLast: true })}</p>
          ) : null}

          <h1 className="r-title mt-0.5 text-[1.75rem]">{node.name}</h1>

          <p className="mt-1 text-[0.9375rem] text-[var(--r-ink-2)]">
            {[kind, copies, countLabel(counts.get(node.id) ?? 0)].filter(Boolean).join(" · ")}
          </p>

          {node.note ? (
            <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--r-ink-3)]">{node.note}</p>
          ) : null}
        </div>
      </section>


      <Board
        node={node}
        tone={tone}
        childNodes={children}
        items={items}
        counts={Object.fromEntries(counts)}
        own={own}
      />
    </main>
  );
}
