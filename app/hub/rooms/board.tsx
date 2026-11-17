import type { CSSProperties } from "react";
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
  type ItemWithPhoto,
  type NodeKind,
  type RoomNode,
} from "@/lib/rooms";
import { addPath, editPath, itemPath, newItemPath, newRoomPath, nodePath } from "./paths";
import { ItemGlyph, Glyph, NodeGlyph } from "./glyph";

/**
 * Lo que hay en un contenedor: lo que contiene y lo que guarda.
 *
 * Esto no tiene estado y no abre nada: cada fila es un enlace a su propia
 * dirección. Antes todo lo de crear y editar vivía en una hoja que subía
 * desde abajo, y esa hoja traía tres problemas que no se arreglan con más
 * CSS: con el teclado abierto no se alcanzaba el botón de cerrar, el scroll
 * peleaba con el de la página detrás, y el botón de atrás del teléfono
 * cerraba la pantalla entera en vez de la hoja.
 *
 * Una pantalla propia no tiene ninguno de los tres. Scrollea como cualquier
 * página, "atrás" vuelve donde tiene que volver, y además cada formulario
 * pasa a tener una dirección que se puede compartir o guardar.
 */
export function Board({
  node,
  tone,
  childNodes,
  items,
  counts,
}: {
  node: RoomNode | null;
  /* El color de la rama, ya resuelto por el servidor: el de la habitación en
     la que estamos. Los hijos lo heredan salvo que tengan uno propio, que es
     lo que pasa en la raíz, donde cada cuarto trae el suyo. */
  tone: string;
  childNodes: RoomNode[];
  items: ItemWithPhoto[];
  counts: Record<string, number>;
}) {
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
  const sorted = sortNodes(childNodes);
  const groups = (["room", "furniture", "compartment", "container"] as NodeKind[])
    .map((kind) => ({ kind, nodes: sorted.filter((child) => child.kind === kind) }))
    .filter((group) => group.nodes.length > 0);

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
                <NodeRow node={child} tone={child.color ?? tone} total={counts[child.id] ?? 0} />
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
                <ItemRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* El pie: la acción que más se repite, donde ya está el pulgar. */}
      <div className="r-bar flex flex-col gap-2">
        {node ? (
          <NavLink
            href={newItemPath(node.id)}
            className="r-key r-key-lit w-full"
            style={{ "--tone": tone } as CSSProperties}
          >
            <PlusSlot className="size-[1.125rem]" />
            Agregar cosa
          </NavLink>
        ) : null}

        {childKinds.length > 0 ? (
          <div className="flex gap-2">
            {childKinds.map((kind) => (
              <NavLink
                key={kind}
                href={node === null ? newRoomPath() : addPath(node.id, kind)}
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
              </NavLink>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * La fila de un contenedor.
 *
 * El enlace y el lápiz son hermanos, no uno dentro del otro: un enlace
 * dentro de otro enlace es HTML inválido y en el teléfono se vuelve una
 * lotería de cuál de los dos se activa.
 */
function NodeRow({ node, tone, total }: { node: RoomNode; tone: string; total: number }) {
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
        className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[14px] p-3.5"
      >
        {/* La foto manda cuando existe: reconocer el mueble de un vistazo es
            más rápido que leer su nombre. */}
        {node.thumb ? (
          <span className="r-trail-shot size-12 rounded-[14px]" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={node.thumb} alt="" />
          </span>
        ) : (
          <Glyph tone={tone}>
            <NodeGlyph kind={node.kind} variant={node.variant} />
          </Glyph>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.0625rem] font-semibold">{node.name}</span>
          <span className="mt-0.5 block truncate text-[0.8125rem] text-[var(--r-ink-3)]">
            {meta}
          </span>
        </span>

        <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--r-ink-3)]" />
      </NavLink>

      <NavLink
        href={editPath(node.id)}
        aria-label={`Editar ${node.name}`}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--r-ink-3)]"
      >
        <Pencil className="size-[1.0625rem]" />
      </NavLink>
    </div>
  );
}

/**
 * La fila de una cosa.
 *
 * Toda la fila abre su pantalla, sin lápiz: un objeto no tiene adentro, así
 * que no hay dos destinos posibles y el toque no es ambiguo.
 */
function ItemRow({ item }: { item: ItemWithPhoto }) {
  const category = categoryOf(item.category);
  const state = conditionOf(item.condition);

  return (
    <NavLink
      href={itemPath(item.node_id, item.id)}
      className="flex w-full items-center gap-3 p-3.5 text-left"
    >
      {item.thumb ? (
        <span className="r-thumb" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumb} alt="" />
        </span>
      ) : (
        <ItemGlyph category={item.category} />
      )}

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

      <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--r-ink-3)]" />
    </NavLink>
  );
}
