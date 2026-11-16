"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Cross, Minus, PlusSlot, Refresh, Trash } from "@/components/icons";
import type { Garment, Outfit, Piece } from "@/lib/rooms";
import { deleteOutfit, saveOutfit, type FormState } from "./actions";

const IDLE: FormState = { status: "idle" };

/**
 * El lienzo donde se arma un conjunto.
 *
 * La idea es la que no da una lista de ropa: ver la camisa sobre el pantalón
 * antes de ponérselos. Por eso las prendas se superponen, se mueven y se
 * escalan en vez de ordenarse en una grilla — una grilla ya la tiene el
 * inventario.
 *
 * Las posiciones se guardan en PORCENTAJES del lienzo, no en píxeles: el
 * conjunto se arma en un teléfono y se mira en cualquier pantalla, y en
 * píxeles se desarmaría al cambiar de ancho.
 */
export function OutfitStudio({
  wardrobe,
  outfit,
  onDone,
}: {
  wardrobe: Garment[];
  outfit?: Outfit;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveOutfit, IDLE);
  const [pieces, setPieces] = useState<Piece[]>(outfit?.pieces ?? []);
  const [picked, setPicked] = useState<string | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (state.status === "saved") onDone();
  }, [state, onDone]);

  const byId = new Map(wardrobe.map((garment) => [garment.id, garment]));

  function add(garment: Garment) {
    if (pieces.length >= 20) return;

    setPieces((current) => [
      ...current,
      /* Entra en el centro y un poco más abajo que la anterior: apiladas en
         el mismo punto exacto, la segunda prenda tapa a la primera y parece
         que no pasó nada. */
      {
        item_id: garment.id,
        x: 50,
        y: Math.min(80, 35 + current.length * 8),
        scale: 1,
        rot: 0,
      },
    ]);
    setPicked(garment.id);
  }

  function update(id: string, patch: Partial<Piece>) {
    setPieces((current) =>
      current.map((piece) => (piece.item_id === id ? { ...piece, ...patch } : piece))
    );
  }

  /**
   * Ajustar tamaño o giro a partir de lo que la prenda tiene AHORA.
   *
   * No a partir de lo que tenía cuando se dibujó el botón: dos toques
   * rápidos en "más grande" leían los dos el mismo valor viejo y el segundo
   * no hacía nada. En una barra de ajustes, los toques rápidos son el uso
   * normal, no el caso raro.
   */
  function tweak(id: string, change: (piece: Piece) => Partial<Piece>) {
    setPieces((current) =>
      current.map((piece) =>
        piece.item_id === id ? { ...piece, ...change(piece) } : piece
      )
    );
  }

  function onDown(event: ReactPointerEvent, piece: Piece) {
    event.preventDefault();

    /* La captura es una mejora, no un requisito: si falla —el puntero ya se
       soltó, el navegador la rechaza— el arrastre tiene que empezar igual.
       Sin el try, la excepción abortaba la función antes de registrar la
       pieza y el gesto moría ahí. */
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // Se sigue sin captura: el movimiento se escucha en el lienzo.
    }

    const box = stage.current?.getBoundingClientRect();
    if (!box) return;

    // El desfase entre el dedo y el centro de la prenda: sin guardarlo, la
    // prenda salta para ponerse bajo el dedo apenas se la toca.
    drag.current = {
      id: piece.item_id,
      dx: ((event.clientX - box.left) / box.width) * 100 - piece.x,
      dy: ((event.clientY - box.top) / box.height) * 100 - piece.y,
    };
    setPicked(piece.item_id);
  }

  function onMove(event: ReactPointerEvent) {
    const held = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!held || !box) return;

    const x = ((event.clientX - box.left) / box.width) * 100 - held.dx;
    const y = ((event.clientY - box.top) / box.height) * 100 - held.dy;

    update(held.id, {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  }

  function onUp(event: ReactPointerEvent) {
    const held = drag.current;
    if (held) {
      const target = event.target as Element;
      if (target.hasPointerCapture?.(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    }
    drag.current = null;
  }

  const chosen = pieces.find((piece) => piece.item_id === picked) ?? null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {outfit ? <input type="hidden" name="id" value={outfit.id} /> : null}
      <input type="hidden" name="pieces" value={JSON.stringify(pieces)} />

      <div
        ref={stage}
        className="r-canvas"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {pieces.length === 0 ? (
          <p className="r-canvas-hint">Tocá una prenda de abajo para ponerla acá.</p>
        ) : null}

        {pieces.map((piece, index) => {
          const garment = byId.get(piece.item_id);
          if (!garment?.cutout) return null;

          return (
            <button
              key={`${piece.item_id}-${index}`}
              type="button"
              onPointerDown={(event) => onDown(event, piece)}
              className="r-piece"
              data-on={picked === piece.item_id}
              style={
                {
                  left: `${piece.x}%`,
                  top: `${piece.y}%`,
                  transform: `translate(-50%, -50%) scale(${piece.scale}) rotate(${piece.rot}deg)`,
                } as CSSProperties
              }
              aria-label={garment.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={garment.cutout} alt="" draggable={false} />
            </button>
          );
        })}
      </div>

      {/* Los controles de la prenda elegida. Aparecen solo con una elegida:
          botones de tamaño y giro flotando sin dueño no significan nada. */}
      {chosen ? (
        <div className="flex items-center gap-2">
          <span className="r-eyebrow min-w-0 flex-1 truncate">
            {byId.get(chosen.item_id)?.name}
          </span>
          <button
            type="button"
            onClick={() =>
              tweak(chosen.item_id, (piece) => ({
                scale: Math.max(0.2, piece.scale - 0.15),
              }))
            }
            className="r-ico"
            aria-label="Más chica"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              tweak(chosen.item_id, (piece) => ({
                scale: Math.min(3, piece.scale + 0.15),
              }))
            }
            className="r-ico"
            aria-label="Más grande"
          >
            <PlusSlot className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              tweak(chosen.item_id, (piece) => ({
                rot: ((piece.rot + 15 + 180) % 360) - 180,
              }))
            }
            className="r-ico"
            aria-label="Girar"
          >
            <Refresh className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPieces((current) =>
                current.filter((piece) => piece.item_id !== chosen.item_id)
              );
              setPicked(null);
            }}
            className="r-ico"
            aria-label="Sacar del conjunto"
          >
            <Cross className="size-4" />
          </button>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="r-eyebrow px-1">Tu ropa recortada</h2>
        <ul className="r-rack">
          {wardrobe.map((garment) => (
            <li key={garment.id}>
              <button
                type="button"
                onClick={() => add(garment)}
                className="r-hanger"
                aria-label={`Agregar ${garment.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {garment.cutout ? <img src={garment.cutout} alt="" /> : null}
                <span className="truncate">{garment.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div>
        <label className="r-field-label" htmlFor="outfit-name">
          ¿Cómo se llama el conjunto?
        </label>
        <input
          id="outfit-name"
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={outfit?.name ?? ""}
          placeholder="Para la oficina, salida de noche…"
          className="r-field"
        />
      </div>

      {state.status === "error" ? (
        <p className="r-alert" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {outfit ? (
          <button
            type="button"
            onClick={() =>
              startTransition(() => {
                void deleteOutfit(outfit.id);
                onDone();
              })
            }
            className="r-ico"
            aria-label="Borrar el conjunto"
          >
            <Trash className="size-[1.125rem]" />
          </button>
        ) : null}

        <button type="submit" disabled={pending} className="r-key r-key-lit flex-1">
          {pending ? "Guardando…" : outfit ? "Guardar cambios" : "Guardar conjunto"}
        </button>
      </div>
    </form>
  );
}
