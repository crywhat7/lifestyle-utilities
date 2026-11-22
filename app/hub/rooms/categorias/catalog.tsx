"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { PlusSlot } from "@/components/icons";
import type { OwnCategory } from "@/lib/rooms";
import { CategoryGlyph } from "../category-glyph";
import { CategoryMaker } from "../category-maker";

/**
 * Las categorías propias, para administrarlas.
 *
 * Crear una se hace en el formulario de una cosa, con el objeto en la mano,
 * que es cuando uno descubre que le falta. Esta pantalla es para lo otro: el
 * nombre que quedó mal escrito, el color que no se distingue del de al lado,
 * y la que se creó de más y hay que borrar.
 *
 * Cada fila dice cuántas cosas la usan. Es el único dato que cambia la
 * decisión de borrar: una etiqueta vacía se borra sin pensar, una con
 * ochenta cosas adentro no.
 */
export function Catalog({ own, counts }: { own: OwnCategory[]; counts: Record<string, number> }) {
  const router = useRouter();

  /* La lista local existe para que renombrar y borrar se vean al instante.
     El `refresh` detrás la vuelve a traer del servidor, que es el que manda
     —y el que sabe los conteos. */
  const [rows, setRows] = useState(own);
  const [editing, setEditing] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  function done() {
    setEditing(null);
    setMaking(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 && !making ? (
        <p className="r-empty">
          Todavía no te hiciste ninguna. Las de fábrica son veintidós y cubren una casa
          normal; esto es para lo que tu casa tiene de propio.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="r-card overflow-hidden">
          {rows.map((row) =>
            editing === row.id ? (
              <li key={row.id} className="p-3">
                <CategoryMaker
                  category={row}
                  onCancel={() => setEditing(null)}
                  onDone={(saved) => {
                    setRows((current) =>
                      current.map((one) => (one.id === saved.id ? saved : one))
                    );
                    done();
                  }}
                  onDeleted={(id) => {
                    setRows((current) => current.filter((one) => one.id !== id));
                    done();
                  }}
                />
              </li>
            ) : (
              <li key={row.id} className="r-row">
                <button
                  type="button"
                  onClick={() => setEditing(row.id)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="r-glyph"
                    data-size="sm"
                    style={{ "--tone": row.hue } as CSSProperties}
                  >
                    <CategoryGlyph category={row.glyph} className="size-[1.0625rem]" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{row.label}</span>
                    <span className="mt-0.5 block text-[0.8125rem] text-[var(--r-ink-3)]">
                      {label(counts[row.id] ?? 0)}
                    </span>
                  </span>
                </button>
              </li>
            )
          )}
        </ul>
      ) : null}

      {making ? (
        <CategoryMaker
          onCancel={() => setMaking(false)}
          onDone={(saved) => {
            setRows((current) => [...current, saved]);
            done();
          }}
        />
      ) : (
        <button type="button" onClick={() => setMaking(true)} className="r-key w-full gap-2">
          <PlusSlot className="size-[1.125rem]" />
          Hacer una categoría
        </button>
      )}
    </div>
  );
}

/** Cuántas cosas la usan, dicho entero y no pegando trozos. */
function label(count: number) {
  if (count === 0) return "Sin nada todavía";
  if (count === 1) return "1 cosa";
  return `${count} cosas`;
}
