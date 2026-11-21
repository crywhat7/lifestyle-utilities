"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { MAX_ZOOM, squareRect, type Square } from "@/lib/photo";

/** La foto ya enderezada, con las medidas con las que se la va a recortar. */
export type Framed = { url: string; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Encuadrar la foto en un cuadrado, con el dedo.
 *
 * Antes el cuadrado lo elegía el código —el centro de la foto— y el resultado
 * era el reclamo de siempre: la cosa fotografiada queda arriba, el recorte se
 * come la parte de abajo y la miniatura muestra una pared. El centro de una
 * foto casi nunca es el centro de lo que importa, y la única forma de
 * acertarle es que lo diga quien la tomó.
 *
 * La ventana es exactamente la que se guarda —mismo cuadrado, mismo encuadre—
 * así que acá no hay sorpresa después: lo que se ve es lo que queda.
 *
 * Un dedo mueve, dos acercan. El riel de abajo hace lo mismo que el pellizco
 * porque en escritorio no hay dos dedos y porque un control visible dice que
 * se puede acercar; el gesto solo lo descubre quien ya lo sabe.
 */
export function SquareFramer({
  photo,
  square,
  onChange,
}: {
  photo: Framed;
  square: Square;
  onChange: (next: Square) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ square: Square; gap: number } | null>(null);

  const rect = squareRect(photo.width, photo.height, square);
  const scale = 100 / rect.side;

  /* El centro se guarda ya acotado: si se dejara correr más allá del borde,
     dos arrastres seguidos hacia el mismo lado dejarían de responder hasta
     "volver" todo lo que se pasó. */
  function commit(next: Square) {
    const zoom = clamp(next.zoom, 1, MAX_ZOOM);
    const side = Math.min(photo.width, photo.height) / zoom;
    const halfX = side / 2 / photo.width;
    const halfY = side / 2 / photo.height;

    onChange({
      zoom,
      cx: clamp(next.cx, halfX, 1 - halfX),
      cy: clamp(next.cy, halfY, 1 - halfY),
    });
  }

  function gapOf() {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onDown(event: ReactPointerEvent) {
    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Sin captura se sigue moviendo: el lienzo escucha igual.
    }

    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    start.current = { square, gap: gapOf() };
  }

  function onMove(event: ReactPointerEvent) {
    const held = touches.current.get(event.pointerId);
    if (!held) return;

    const box = stage.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;

    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    held.x = event.clientX;
    held.y = event.clientY;

    // Un píxel de pantalla vale esto en píxeles de la foto.
    const perPixel = rect.side / box.width;

    if (touches.current.size >= 2) {
      const first = start.current;
      const gap = gapOf();

      if (first && first.gap > 0 && gap > 0) {
        commit({ ...square, zoom: first.square.zoom * (gap / first.gap) });
      }
      return;
    }

    commit({
      ...square,
      cx: square.cx - (dx * perPixel) / photo.width,
      cy: square.cy - (dy * perPixel) / photo.height,
    });
  }

  function onUp(event: ReactPointerEvent) {
    touches.current.delete(event.pointerId);
    start.current = touches.current.size > 0 ? { square, gap: gapOf() } : null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={stage}
        className="r-framer"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt=""
          draggable={false}
          style={{
            width: `${photo.width * scale}%`,
            height: `${photo.height * scale}%`,
            left: `${-rect.x * scale}%`,
            top: `${-rect.y * scale}%`,
          }}
        />
        <span className="r-framer-grid" aria-hidden="true" />
      </div>

      <label className="r-zoom">
        <span className="sr-only">Acercar la foto</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.02}
          value={square.zoom}
          onChange={(event) => commit({ ...square, zoom: Number(event.target.value) })}
        />
      </label>

      <p className="r-hint">Arrastrá para mover · pellizcá o usá el riel para acercar</p>
    </div>
  );
}
