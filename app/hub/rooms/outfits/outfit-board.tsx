"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { PlusSlot } from "@/components/icons";
import type { Garment, Outfit } from "@/lib/rooms";
import { OutfitStudio } from "../outfit-studio";

/**
 * Los conjuntos guardados, y la puerta para armar otro.
 *
 * Cada conjunto se muestra como lo que es —la composición, no una lista de
 * nombres—: las mismas prendas en las mismas posiciones, a escala. Un
 * conjunto descrito con palabras ("camisa azul + jean") no se puede evaluar
 * de un vistazo, y evaluarlo de un vistazo es para lo que existe.
 */
export function OutfitBoard({
  outfits,
  wardrobe,
}: {
  outfits: Outfit[];
  wardrobe: Garment[];
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Outfit | null>(null);
  const [open, setOpen] = useState(false);

  const byId = new Map(wardrobe.map((garment) => [garment.id, garment]));

  function start(outfit: Outfit | null) {
    setEditing(outfit);
    setOpen(true);
    if (!sheet.current?.open) sheet.current?.showModal();
  }

  const close = useCallback(() => sheet.current?.close(), []);

  return (
    <>
      {wardrobe.length === 0 ? (
        <p className="r-empty">
          Todavía no hay ropa recortada. Buscá una prenda en tu inventario, ponele una
          foto y tocá “Quitar el fondo”: desde ahí se puede combinar.
        </p>
      ) : null}

      {outfits.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {outfits.map((outfit, index) => (
            <li key={outfit.id} className="r-rise" style={{ "--d": `${index * 50}ms` } as CSSProperties}>
              <button
                type="button"
                onClick={() => start(outfit)}
                className="r-card r-tap w-full overflow-hidden p-0 text-left"
              >
                <span className="r-thumbnail">
                  {outfit.pieces.map((piece, spot) => {
                    const garment = byId.get(piece.item_id);
                    if (!garment?.cutout) return null;

                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${piece.item_id}-${spot}`}
                        src={garment.cutout}
                        alt=""
                        style={{
                          left: `${piece.x}%`,
                          top: `${piece.y}%`,
                          transform: `translate(-50%, -50%) scale(${piece.scale}) rotate(${piece.rot}deg)`,
                        }}
                      />
                    );
                  })}
                </span>
                <span className="block p-3">
                  <span className="block truncate text-[0.9375rem] font-semibold">
                    {outfit.name}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-[var(--r-ink-3)]">
                    {outfit.pieces.length === 1
                      ? "1 prenda"
                      : `${outfit.pieces.length} prendas`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {wardrobe.length > 0 ? (
        <div className="r-bar">
          <button
            type="button"
            onClick={() => start(null)}
            className="r-key r-key-lit w-full"
            style={{ "--tone": "#d6456f" } as CSSProperties}
          >
            <PlusSlot className="size-[1.125rem]" />
            Armar un conjunto
          </button>
        </div>
      ) : null}

      <dialog
        ref={sheet}
        className="r-sheet"
        aria-label="Armar un conjunto"
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onClick={(event) => {
          if (event.target === sheet.current) close();
        }}
      >
        <span aria-hidden="true" className="r-grip" />
        {/* El estudio se monta recién al abrir, y se desmonta al cerrar: así
            cada conjunto empieza con el lienzo del que se abrió y no con el
            del anterior. */}
        {open ? (
          <OutfitStudio
            key={editing?.id ?? "nuevo"}
            wardrobe={wardrobe}
            outfit={editing ?? undefined}
            onDone={close}
          />
        ) : null}
      </dialog>
    </>
  );
}
