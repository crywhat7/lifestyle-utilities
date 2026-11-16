"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chevron, Pencil, PlusSlot } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  KIND_LABEL,
  allowedChildren,
  categoryOf,
  conditionOf,
  countLabel,
  sortNodes,
  variantLabel,
  type Item,
  type NodeKind,
  type RoomNode,
} from "@/lib/rooms";
import { nodePath } from "./paths";
import { ItemForm, NodeForm, type Place } from "./forms";
import { ItemGlyph, Glyph, NodeGlyph } from "./glyph";

/**
 * Todo lo que se toca de una pantalla de Rooms.
 *
 * Un solo componente de cliente para las listas, el pie y la hoja, en vez de
 * uno por fila: la hoja modal es UNA y vive acá. Con un componente por fila
 * habría una `<dialog>` por tarjeta —cuarenta diálogos ocultos en una
 * pantalla de cuarenta cosas— y el estado de "qué estoy editando" tendría
 * que vivir en algún lado de todas formas.
 *
 * La navegación sigue siendo de servidor: cada contenedor es un enlace a su
 * propia URL, no un acordeón. Así el botón de atrás del teléfono hace lo que
 * tiene que hacer y una gaveta se puede compartir o guardar como dirección.
 */
export function Board({
  node,
  tone,
  childNodes,
  items,
  counts,
  places,
  usedColors,
}: {
  node: RoomNode | null;
  /* El color de la rama, ya resuelto por el servidor: el de la habitación en
     la que estamos. Los hijos lo heredan salvo que tengan uno propio, que es
     lo que pasa en la raíz, donde cada cuarto trae el suyo. */
  tone: string;
  childNodes: RoomNode[];
  items: Item[];
  counts: Record<string, number>;
  places: Place[];
  usedColors: string[];
}) {
  const sheet = useRef<HTMLDialogElement>(null);

  type Mode =
    | { what: "new-node"; kind: NodeKind }
    | { what: "edit-node"; node: RoomNode }
    | { what: "new-item" }
    | { what: "edit-item"; item: Item };

  const [mode, setMode] = useState<Mode | null>(null);

  function open(next: Mode) {
    setMode(next);
    if (!sheet.current?.open) sheet.current?.showModal();
  }

  // `useCallback` no es decorativo: este cierre es la dependencia del efecto
  // que cierra la hoja al guardar, y una función nueva en cada render lo
  // haría correr de más.
  const close = useCallback(() => sheet.current?.close(), []);

  /*
     Qué se puede crear acá. En la raíz, habitaciones. Dentro de un nodo, lo
     que la jerarquía permita — y nada si ya se tocó el techo de profundidad,
     porque ofrecer un botón que la base va a rechazar es mentirle a la mano.
  */
  const childKinds: NodeKind[] =
    node === null ? ["room"] : allowedChildren(node.kind, node.depth);

  /* Los hijos agrupados por tipo: los muebles en una sección y las cajas en
     otra. Mezclados, una habitación con tres muebles y nueve cajas se lee
     como una bolsa de cosas. */
  const groups = useMemo(() => {
    const sorted = sortNodes(childNodes);
    const kinds: NodeKind[] = ["room", "furniture", "compartment", "container"];

    return kinds
      .map((kind) => ({ kind, nodes: sorted.filter((child) => child.kind === kind) }))
      .filter((group) => group.nodes.length > 0);
  }, [childNodes]);

  const empty = groups.length === 0 && items.length === 0;
  let step = 0;

  return (
    <>
      {empty ? (
        <p className="r-empty r-rise" style={{ "--d": "80ms" } as CSSProperties}>
          {node === null
            ? "Todavía no hay ninguna habitación. Empezá por el cuarto donde estás."
            : "Acá no hay nada guardado todavía."}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.kind} className="flex flex-col gap-2">
          <h2
            className="r-eyebrow r-rise px-1"
            style={{ "--d": `${(step += 1) * 40}ms` } as CSSProperties}
          >
            {KIND_LABEL[group.kind].many}
          </h2>

          <ul className="flex flex-col gap-2">
            {group.nodes.map((child) => (
              <li
                key={child.id}
                className="r-rise"
                style={{ "--d": `${(step += 1) * 40}ms` } as CSSProperties}
              >
                <NodeRow
                  node={child}
                  tone={child.color ?? tone}
                  total={counts[child.id] ?? 0}
                  onEdit={() => open({ what: "edit-node", node: child })}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {items.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2
            className="r-eyebrow r-rise px-1"
            style={{ "--d": `${(step += 1) * 40}ms` } as CSSProperties}
          >
            Acá dentro
          </h2>

          <ul className="r-card overflow-hidden">
            {items.map((item) => (
              <li key={item.id} className="r-row">
                <ItemRow item={item} onEdit={() => open({ what: "edit-item", item })} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* El pie: la acción que más se repite, donde ya está el pulgar. */}
      <div className="r-bar flex flex-col gap-2">
        {node ? (
          <button
            type="button"
            onClick={() => open({ what: "new-item" })}
            className="r-key r-key-lit w-full"
            style={{ "--tone": tone } as CSSProperties}
          >
            <PlusSlot className="size-[1.125rem]" />
            Agregar cosa
          </button>
        ) : null}

        {childKinds.length > 0 ? (
          <div className="flex gap-2">
            {childKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => open({ what: "new-node", kind })}
                className={`r-key min-w-0 flex-1 text-[0.9375rem] ${
                  node === null ? "r-key-lit" : ""
                }`}
              >
                <PlusSlot className="size-[1.125rem] shrink-0" />
                {/* Con un solo tipo la píldora es ancha y entra la frase
                    entera; con dos, cada una tiene media pantalla. */}
                <span className="truncate">
                  {childKinds.length === 1 ? KIND_LABEL[kind].add : KIND_LABEL[kind].short}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <dialog
        ref={sheet}
        className="r-sheet"
        aria-label="Editar"
        onClose={() => setMode(null)}
        onClick={(event) => {
          // Tocar el velo cierra, igual que en cualquier hoja del sistema.
          if (event.target === sheet.current) close();
        }}
      >
        <span aria-hidden="true" className="r-grip" />

        {mode?.what === "new-node" ? (
          <NodeForm
            kind={mode.kind}
            parentId={node?.id ?? null}
            usedColors={usedColors}
            onSaved={close}
          />
        ) : null}

        {mode?.what === "edit-node" ? (
          <NodeForm
            kind={mode.node.kind}
            parentId={mode.node.parent_id}
            node={mode.node}
            usedColors={usedColors}
            onSaved={close}
          />
        ) : null}

        {mode?.what === "new-item" && node ? (
          <ItemForm nodeId={node.id} places={places} onSaved={close} />
        ) : null}

        {mode?.what === "edit-item" ? (
          <ItemForm
            nodeId={mode.item.node_id}
            item={mode.item}
            places={places}
            onSaved={close}
          />
        ) : null}
      </dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * La fila de un contenedor.
 *
 * El enlace y el lápiz son hermanos, no uno dentro del otro: un botón dentro
 * de un enlace es HTML inválido y en el teléfono se vuelve una lotería de
 * cuál de los dos se activa.
 */
function NodeRow({
  node,
  tone,
  total,
  onEdit,
}: {
  node: RoomNode;
  tone: string;
  total: number;
  onEdit: () => void;
}) {
  const kind = variantLabel(node.kind, node.variant);
  const copies = node.quantity > 1 ? `${node.quantity} iguales` : null;
  const meta = [kind, copies, countLabel(total)].filter(Boolean).join(" · ");

  return (
    <div
      className="r-card r-tap flex items-center gap-1 pr-2"
      style={{ "--tone": tone } as CSSProperties}
    >
      <NavLink
        href={nodePath(node.id)}
        className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[26px] p-3.5"
      >
        <Glyph tone={tone}>
          <NodeGlyph kind={node.kind} variant={node.variant} />
        </Glyph>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.0625rem] font-semibold">{node.name}</span>
          <span className="mt-0.5 block truncate text-[0.8125rem] text-[var(--r-ink-3)]">
            {meta}
          </span>
        </span>

        <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--r-ink-3)]" />
      </NavLink>

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${node.name}`}
        className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--r-ink-3)] active:scale-90"
      >
        <Pencil className="size-[1.0625rem]" />
      </button>
    </div>
  );
}

/**
 * La fila de una cosa.
 *
 * Toda la fila abre la edición, sin lápiz: un objeto no tiene adentro, así
 * que no hay dos destinos posibles y el toque no es ambiguo.
 */
function ItemRow({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const category = categoryOf(item.category);
  const state = conditionOf(item.condition);

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 p-3.5 text-left active:bg-[var(--r-card-2)]"
    >
      <ItemGlyph category={item.category} />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[1rem] font-medium">{item.name}</span>
          {item.quantity > 1 ? (
            <span className="shrink-0 text-[0.8125rem] tabular-nums text-[var(--r-ink-3)]">
              ×{item.quantity}
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem]">
          <span
            aria-hidden="true"
            className="r-dot"
            style={{ "--tone": category.hue } as CSSProperties}
          />
          <span className="text-[var(--r-ink-3)]">{category.label}</span>
          <span className="text-[var(--r-ink-3)]">·</span>
          <span className="r-state truncate" data-tone={state.tone}>
            {state.label}
          </span>
        </span>

        {item.note ? (
          <span className="mt-1 block truncate text-[0.8125rem] text-[var(--r-ink-3)]">
            {item.note}
          </span>
        ) : null}
      </span>

      <Pencil className="size-4 shrink-0 text-[var(--r-ink-3)]" />
    </button>
  );
}
