import type { CSSProperties } from "react";
import { Chevron } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  KIND_LABEL,
  categoryOf,
  variantLabel,
  type IndexEntry,
  type OwnCategory,
  type RoomNode,
} from "@/lib/rooms";
import { nodePath } from "./paths";
import { ItemGlyph, Glyph, NodeGlyph } from "./glyph";

/**
 * Cómo llegar a una cosa.
 *
 * Esta es la razón de ser del módulo, dicha en una pantalla. Saber que el
 * cable está "en la gaveta 2" no sirve para explicarle a nadie dónde está —
 * "gaveta 2" no significa nada para quien no vive en ese cuarto. Lo que
 * sirve es VER el camino: este es el armario, esta es la gaveta, esta es la
 * bolsa, acá está el cable.
 *
 * Por eso los contenedores pueden tener foto, y por eso esta pantalla tiene
 * dirección propia: el camino hasta algo es justo lo que uno quiere mandar.
 *
 * Cada paso es además un enlace, así que la misma pantalla sirve para
 * mostrarle a alguien el camino y para ir uno mismo hasta la mitad.
 */
export function Trail({
  item,
  nodes,
  own,
}: {
  item: IndexEntry;
  nodes: RoomNode[];
  own?: OwnCategory[];
}) {
  const node = nodes.find((candidate) => candidate.id === item.node_id);

  // Los ancestros en orden, de la habitación hacia adentro. `path_ids` ya
  // viene ordenado desde la base y termina en el propio nodo.
  const steps = node
    ? node.path_ids
        .map((id) => nodes.find((candidate) => candidate.id === id))
        .filter((step): step is RoomNode => Boolean(step))
    : [];

  const withPhotos = steps.filter((step) => step.thumb).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="r-rise" style={{ "--d": "40ms" } as CSSProperties}>
        <p className="r-eyebrow">Cómo llegar</p>
        <h1 className="r-title mt-1">{item.name}</h1>
      </section>

      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className="r-rise"
            style={{ "--d": `${80 + i * 50}ms` } as CSSProperties}
          >
            <NavLink
              href={nodePath(step.id)}
              className="r-card r-tap flex items-center gap-3 p-3"
              style={{ "--tone": step.color ?? "var(--r-ink-2)" } as CSSProperties}
            >
              <span className="r-step">{i + 1}</span>

              {/* La foto manda cuando existe: es lo único de esta pantalla
                  que se entiende sin leer. */}
              {step.thumb ? (
                <span className="r-trail-shot">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={step.thumb} alt="" />
                </span>
              ) : (
                <Glyph tone={step.color ?? "#6b7280"} size="sm">
                  <NodeGlyph kind={step.kind} variant={step.variant} />
                </Glyph>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold">{step.name}</span>
                <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--r-ink-3)]">
                  {variantLabel(step.kind, step.variant) ?? KIND_LABEL[step.kind].one}
                </span>
              </span>

              <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--r-ink-3)]" />
            </NavLink>
          </li>
        ))}

        {/* El último paso es la cosa, y no es un enlace: es el final. */}
        <li
          className="r-card r-rise flex items-center gap-3 p-3"
          style={
            {
              "--tone": categoryOf(item.category, own).hue,
              "--d": `${80 + steps.length * 50}ms`,
            } as CSSProperties
          }
        >
          <span className="r-step r-step-end">★</span>
          <ItemGlyph category={item.category} own={own} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-semibold">{item.name}</span>
            <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--r-ink-3)]">
              {item.quantity > 1
                ? `${item.quantity} · ${categoryOf(item.category, own).label}`
                : categoryOf(item.category, own).label}
            </span>
          </span>
        </li>
      </ol>

      {withPhotos < steps.length ? (
        <p className="r-hint">
          {withPhotos === 0
            ? "Ninguno de estos lugares tiene foto todavía. Si les ponés una, esta ruta se puede mostrar sin explicar nada."
            : "A algunos de estos lugares les falta la foto. Con todas, la ruta se entiende sola."}
        </p>
      ) : null}
    </div>
  );
}
