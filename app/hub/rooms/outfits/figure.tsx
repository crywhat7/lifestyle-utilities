"use client";

import { useRef, type CSSProperties } from "react";
import { boxOf, slotOf, type Garment, type Piece } from "@/lib/rooms";

/**
 * El conjunto, tendido sobre la mesa.
 *
 * Antes esto era un maniquí: un cuerpo dibujado con una línea y seis zonas
 * donde caían las prendas. La idea era dar escala y el resultado era un
 * muñeco de palitos con ropa encima. Nadie arma un conjunto para ver un
 * muñeco.
 *
 * Así se arman de verdad: las prendas tendidas sobre una superficie, como
 * cuando uno las pone sobre la cama antes de vestirse. Sin cuerpo, sin
 * contornos, sin nada que no sea la ropa.
 *
 * Cada prenda nace en su lugar —ver `LAYOUT`— y se puede mover y agrandar
 * desde ahí. Las dos mitades importan por igual: un lienzo donde todo nace
 * en el centro y hay que acomodarlo no es libertad, es tarea; y una rejilla
 * donde nada se mueve termina poniéndole al conjunto la forma del programa
 * en vez de la que uno quiere.
 *
 * El mismo dibujo en el armador y en la miniatura de la lista: si un
 * conjunto se viera distinto en los dos lados, el armador no serviría para
 * decidir nada. Lo único que cambia es que acá se puede agarrar.
 */
export function OutfitFigure({
  pieces,
  wardrobe,
  active,
  onPick,
  onMove,
}: {
  pieces: Piece[];
  wardrobe: Garment[];
  /** La prenda que se está tocando: se marca para saber dónde mirar. */
  active?: string | null;
  onPick?: (slot: string) => void;
  /** Mover: llega en por ciento del lienzo, ya recortado a sus bordes. */
  onMove?: (slot: string, x: number, y: number) => void;
}) {
  const byId = new Map(wardrobe.map((garment) => [garment.id, garment]));
  const table = useRef<HTMLDivElement>(null);

  /* Lo que de verdad se puede dibujar. Una prenda sin recorte no entra: el
     fondo del cuarto detrás de la camisa arruina el conjunto entero, que es
     justamente lo que `loadWardrobe` filtra antes de llegar acá. */
  const worn = pieces
    .map((piece) => ({ piece, garment: byId.get(piece.item_id) }))
    .filter((row): row is { piece: Piece; garment: Garment } => Boolean(row.garment?.cutout));

  /**
   * Arrastrar.
   *
   * Con eventos de puntero y no de ratón: el mismo código sirve para el dedo
   * y para el mouse, y `setPointerCapture` es lo que hace que la prenda siga
   * al dedo aunque se salga de ella —sin eso, mover rápido la suelta a mitad
   * de camino—.
   *
   * Se guarda el desfase del agarre para que la prenda no salte a centrarse
   * bajo el dedo en el primer píxel, que es lo que hace sentir que una cosa
   * se agarró de verdad y no que se teletransportó.
   */
  function drag(event: React.PointerEvent<HTMLElement>, slot: string, piece: Piece) {
    if (!onMove) return;

    const box = table.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;

    const node = event.currentTarget;
    const grabX = ((event.clientX - box.left) / box.width) * 100 - piece.x;
    const grabY = ((event.clientY - box.top) / box.height) * 100 - piece.y;

    let moved = false;
    node.setPointerCapture(event.pointerId);

    const to = (move: PointerEvent) => {
      const x = ((move.clientX - box.left) / box.width) * 100 - grabX;
      const y = ((move.clientY - box.top) / box.height) * 100 - grabY;

      if (!moved && Math.abs(x - piece.x) + Math.abs(y - piece.y) < 1) return;
      moved = true;

      /* Recortado a la mesa: una prenda arrastrada fuera del lienzo no se
         pierde —seguiría en el conjunto— pero no se podría volver a agarrar. */
      onMove(slot, clamp(x), clamp(y));
    };

    const stop = () => {
      node.removeEventListener("pointermove", to);
      node.removeEventListener("pointerup", stop);
      node.removeEventListener("pointercancel", stop);
      /* Si no se movió, fue un toque: eso selecciona. */
      if (!moved) onPick?.(slot);
    };

    node.addEventListener("pointermove", to);
    node.addEventListener("pointerup", stop);
    node.addEventListener("pointercancel", stop);
  }

  return (
    <div className="r-lay" ref={table}>
      {worn.map(({ piece, garment }, index) => {
        const slot = piece.slot ?? `loose-${index}`;
        const base = boxOf(piece.slot);
        const scale = piece.scale || 1;

        return (
          <div
            key={`${piece.item_id}-${index}`}
            className="r-piece"
            data-on={active === slot}
            data-live={onMove ? "true" : undefined}
            title={garment.name}
            onPointerDown={(event) => drag(event, slot, piece)}
            style={
              {
                left: `${piece.x}%`,
                top: `${piece.y}%`,
                width: `${base.w * scale}%`,
                height: `${base.h * scale}%`,
                transform: `translate(-50%, -50%) rotate(${piece.rot || 0}deg)`,
                zIndex: slotOf(piece.slot)?.z ?? 1,
              } as CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={garment.cutout ?? ""} alt="" draggable={false} />
          </div>
        );
      })}

      {worn.length === 0 ? (
        <p className="r-lay-empty">Elegí abajo y se va armando acá.</p>
      ) : null}
    </div>
  );
}

const clamp = (value: number) => Math.min(96, Math.max(4, value));
