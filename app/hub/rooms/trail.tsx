"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Chevron, Cross } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { KIND_LABEL, categoryOf, variantLabel, type IndexEntry, type RoomNode } from "@/lib/rooms";
import { nodePath } from "./paths";
import { ItemGlyph, Glyph, NodeGlyph } from "./glyph";

/**
 * Cómo llegar a una cosa.
 *
 * Esta es la razón de ser del módulo, dicha en una pantalla. Saber que el
 * cable está "en la gaveta 2" no sirve para explicarle a nadie dónde está —
 * "gaveta 2" no significa nada para quien no vive en ese cuarto. Lo que
 * sirve es VER el camino: esta es la puerta, este es el armario, esta es la
 * gaveta, esta es la bolsa, acá está el cable.
 *
 * Por eso los contenedores pueden tener foto y por eso esa foto no se dibuja
 * en el plano: existe para este momento.
 *
 * Cada paso es además un enlace, así que la misma pantalla sirve para
 * mostrarle a alguien el camino y para ir uno mismo hasta la mitad.
 */
export function Trail({
  hit,
  nodes,
  onClose,
}: {
  hit: { item: IndexEntry; where: string; nodeId: string } | null;
  nodes: RoomNode[];
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const box = sheet.current;
    if (!box) return;

    if (hit && !box.open) box.showModal();
    if (!hit && box.open) box.close();
  }, [hit]);

  const node = hit ? nodes.find((candidate) => candidate.id === hit.nodeId) : null;

  // Los ancestros en orden, de la habitación hacia adentro. `path_ids` ya
  // viene ordenado desde la base y termina en el propio nodo.
  const steps = node
    ? node.path_ids
        .map((id) => nodes.find((candidate) => candidate.id === id))
        .filter((step): step is RoomNode => Boolean(step))
    : [];

  const withPhotos = steps.filter((step) => step.thumb).length;

  return (
    <dialog
      ref={sheet}
      className="r-sheet"
      aria-label="Cómo llegar"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === sheet.current) sheet.current?.close();
      }}
    >
      <span aria-hidden="true" className="r-grip" />

      {hit ? (
        <div className="flex flex-col gap-4 pb-2">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="r-eyebrow">Cómo llegar</p>
              <h2 className="r-title mt-1 text-[1.4rem]">{hit.item.name}</h2>
            </div>
            <button type="button" onClick={() => sheet.current?.close()} className="r-ico" aria-label="Cerrar">
              <Cross className="size-4" />
            </button>
          </header>

          <ol className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <li key={step.id}>
                <NavLink
                  href={nodePath(step.id)}
                  className="r-card r-tap flex items-center gap-3 p-3"
                  style={{ "--tone": step.color ?? "#b58338" } as CSSProperties}
                >
                  <span className="r-step">{i + 1}</span>

                  {/* La foto manda cuando existe: es lo único de esta
                      pantalla que se entiende sin leer. */}
                  {step.thumb ? (
                    <span className="r-trail-shot">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={step.thumb} alt="" />
                    </span>
                  ) : (
                    <Glyph tone={step.color ?? "#b58338"} size="sm">
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
              className="r-card flex items-center gap-3 p-3"
              style={{ "--tone": categoryOf(hit.item.category).hue } as CSSProperties}
            >
              <span className="r-step r-step-end">★</span>
              <ItemGlyph category={hit.item.category} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold">{hit.item.name}</span>
                <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--r-ink-3)]">
                  {hit.item.quantity > 1
                    ? `${hit.item.quantity} · ${categoryOf(hit.item.category).label}`
                    : categoryOf(hit.item.category).label}
                </span>
              </span>
            </li>
          </ol>

          {withPhotos < steps.length ? (
            <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--r-ink-3)]">
              {withPhotos === 0
                ? "Ninguno de estos lugares tiene foto todavía. Si les ponés una, esta ruta se puede mostrar sin explicar nada."
                : "A algunos de estos lugares les falta la foto. Con todas, la ruta se entiende sola."}
            </p>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
