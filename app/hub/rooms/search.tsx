"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Cross, Pin, Search as SearchIcon } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  categoryOf,
  conditionOf,
  search,
  type IndexEntry,
  type OwnCategory,
  type RoomNode,
} from "@/lib/rooms";
import { nodePath, trailPath } from "./paths";
import { ItemGlyph } from "./glyph";

/**
 * El buscador.
 *
 * La promesa del módulo entera se juega acá: guardar dónde están las cosas
 * solo sirve si encontrarlas después cuesta menos que levantarse a revisar el
 * cajón. Por eso está arriba de todo y por eso filtra en el navegador — el
 * inventario ya vino con la página, así que "cable" se resuelve en la misma
 * tecla, sin un viaje al servidor por pulsación.
 *
 * Y por eso cada resultado trae su ruta completa: el nombre de la cosa no
 * sirve de nada sin el "Cuarto › Armario › Gaveta 2 › Bolsa negra" debajo.
 * Eso es lo que se va a leer, no el nombre.
 */
export function Search({
  index,
  nodes,
  own,
}: {
  index: IndexEntry[];
  nodes: RoomNode[];
  own?: OwnCategory[];
}) {
  const [query, setQuery] = useState("");

  const hits = useMemo(() => search(index, nodes, query), [index, nodes, query]);

  const typing = query.trim().length > 0;
  const short = typing && query.trim().length < 2;

  return (
    <section className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[var(--r-ink-3)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar un cable, una camisa, un clip…"
          aria-label="Buscar en todo el inventario"
          autoComplete="off"
          className="r-field pr-12 pl-11"
        />
        {typing ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Borrar la búsqueda"
            className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-[var(--r-ink-3)] active:scale-90"
          >
            <Cross className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Mientras no se escriba nada, acá no hay nada: la pantalla sigue
          siendo la de los cuartos. El buscador no se adueña de la portada. */}
      {!typing ? null : short ? (
        <p className="px-1 text-[0.8125rem] text-[var(--r-ink-3)]">Escribí un poco más.</p>
      ) : hits.length === 0 ? (
        <p className="r-empty">
          Nada se llama así. Puede que esté guardado con otro nombre, o que todavía no lo
          hayas anotado.
        </p>
      ) : (
        <>
          {/* Sin este rótulo, los resultados y la lista de habitaciones de
              abajo se leen como una sola lista revuelta. */}
          <p className="r-eyebrow px-1">
            {hits.length === 1 ? "1 resultado" : `${hits.length} resultados`}
          </p>
          <ul className="r-card overflow-hidden">
          {hits.map((hit) => {
            const category = categoryOf(hit.item.category, own);
            const state = conditionOf(hit.item.condition);

            return (
              <li key={hit.item.id} className="r-row flex items-center gap-1 pr-2">
                <NavLink
                  href={nodePath(hit.nodeId)}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3.5"
                >
                  <ItemGlyph category={hit.item.category} own={own} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[1rem] font-medium">{hit.item.name}</span>
                      {hit.item.quantity > 1 ? (
                        <span className="shrink-0 text-[0.8125rem] tabular-nums text-[var(--r-ink-3)]">
                          ×{hit.item.quantity}
                        </span>
                      ) : null}
                    </span>

                    {/* La ruta es el resultado. Por eso va con el color de la
                        categoría al lado y no en gris de pie de página. */}
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="r-dot shrink-0"
                        style={{ "--tone": category.hue } as CSSProperties}
                      />
                      <span className="r-crumb flex-1 text-left">{hit.where}</span>
                    </span>

                    <span className="r-state mt-0.5 block text-[0.75rem]" data-tone={state.tone}>
                      {state.label}
                    </span>
                  </span>
                </NavLink>

                {/* El atajo que justifica todo el módulo: no ir hasta la
                    cosa, sino poder MOSTRAR el camino. */}
                <NavLink
                  href={trailPath(hit.item.id)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--r-gold)]"
                  aria-label={`Cómo llegar a ${hit.item.name}`}
                >
                  <Pin className="size-[1.0625rem]" />
                </NavLink>
              </li>
            );
          })}
          </ul>
        </>
      )}

    </section>
  );
}
