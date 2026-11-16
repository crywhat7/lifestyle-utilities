"use client";

import {
  startTransition,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, PlusSlot } from "@/components/icons";
import {
  COLS,
  FLOOR_COLORS,
  ROWS,
  VIEW_H,
  VIEW_W,
  WALL_COLORS,
  clampToFloor,
  depthOrder,
  firstFreeCell,
  footprint,
  overlaps,
  toGrid,
} from "@/lib/iso";
import { variantLabel, type RoomNode } from "@/lib/rooms";
import { placeNode, paintRoom, unplaceNode } from "./actions";
import { nodePath } from "./paths";
import { CANVAS, Floor, Furniture, Ghost, Walls, type Piece } from "./room-svg";

/**
 * El cuarto, para mirarlo y para acomodarlo.
 *
 * Dos modos y una sola pantalla. Mirando, cada mueble es un enlace a lo que
 * guarda —que es el punto entero de la vista: tocar el armario y ver lo que
 * hay dentro—. Acomodando, el mismo mueble se arrastra por la grilla.
 *
 * Mezclarlos sería el error clásico: si tocar siempre moviera, abrir un
 * mueble sería imposible sin mover otro de paso; si tocar siempre abriera, no
 * habría cómo acomodar con el dedo. El modo lo dice un botón y se ve: entra
 * la retícula.
 */
export function PlanView({
  room,
  furniture,
  tone,
}: {
  room: RoomNode;
  furniture: RoomNode[];
  tone: string;
}) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);

  const [editing, setEditing] = useState(false);
  const [wall, setWall] = useState(room.wall_color ?? WALL_COLORS[0]);
  const [floor, setFloor] = useState(room.floor_color ?? FLOOR_COLORS[0]);

  /*
    Las posiciones se llevan acá mientras dura el gesto. El servidor se entera
    al soltar, no en cada píxel: guardar durante el arrastre sería una
    escritura por cuadro y el mueble iría a los saltos detrás del dedo.
  */
  const [spots, setSpots] = useState<Record<string, { x: number; y: number }>>({});
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const capture = useRef<{ el: Element; id: number } | null>(null);

  const placed = useMemo(() => {
    return furniture
      .filter((node) => node.grid_x !== null && node.grid_y !== null)
      .map((node) => {
        const shape = footprint(node.variant, node.rotation, {
          w: node.grid_w,
          h: node.grid_h,
        });
        const moved = spots[node.id];

        return {
          id: node.id,
          name: node.name,
          variant: node.variant,
          x: moved?.x ?? node.grid_x ?? 0,
          y: moved?.y ?? node.grid_y ?? 0,
          w: shape.w,
          h: shape.h,
          lift: shape.lift,
          color: node.color ?? tone,
        } satisfies Piece;
      });
  }, [furniture, spots, tone]);

  const loose = furniture.filter((node) => node.grid_x === null || node.grid_y === null);

  /** De las coordenadas del dedo a las del lienzo, sin importar la escala. */
  function toCanvas(event: ReactPointerEvent) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;

    return {
      sx: ((event.clientX - box.left) / box.width) * VIEW_W,
      sy: ((event.clientY - box.top) / box.height) * VIEW_H,
    };
  }

  function onDown(event: ReactPointerEvent, piece: Piece) {
    if (!editing) return;

    event.preventDefault();
    // Capturar el puntero es lo que deja seguir el dedo aunque se salga del
    // mueble: sin esto, mover rápido suelta la pieza a mitad de camino.
    const target = event.target as Element;
    target.setPointerCapture?.(event.pointerId);
    capture.current = { el: target, id: event.pointerId };
    setDrag({ id: piece.id, x: piece.x, y: piece.y });
  }

  /**
   * Soltar la captura, siempre.
   *
   * Una captura que queda tomada se lleva todos los punteros siguientes: los
   * toques posteriores se entregan al mueble viejo y la pantalla deja de
   * responder donde uno toca. Pasa cuando el `pointerup` no llega al elemento
   * —el sistema cancela el gesto, la pestaña pierde el foco—, así que el
   * release no puede depender de que el gesto termine bien.
   */
  function release() {
    const held = capture.current;
    if (!held) return;

    try {
      if (held.el.hasPointerCapture?.(held.id)) held.el.releasePointerCapture(held.id);
    } catch {
      // El elemento ya no está en el documento: no hay nada que soltar.
    }

    capture.current = null;
  }

  function onMove(event: ReactPointerEvent) {
    if (!drag) return;

    const point = toCanvas(event);
    if (!point) return;

    const piece = placed.find((item) => item.id === drag.id);
    if (!piece) return;

    /* El dedo apunta al centro de la pieza, no a su esquina de atrás: sin
       restar media huella, el mueble salta hacia arriba al agarrarlo. */
    const raw = toGrid(point.sx, point.sy);
    const next = clampToFloor(raw.x - piece.w / 2, raw.y - piece.h / 2, piece.w, piece.h);

    if (next.x !== drag.x || next.y !== drag.y) setDrag({ ...drag, ...next });
  }

  function onUp() {
    release();
    if (!drag) return;

    const piece = placed.find((item) => item.id === drag.id);
    setDrag(null);
    if (!piece) return;

    const spot = { x: drag.x, y: drag.y, w: piece.w, h: piece.h };

    // Encima de otro mueble no se suelta: la pieza vuelve sola a donde estaba.
    const collides = placed.some(
      (other) => other.id !== piece.id && overlaps(spot, other)
    );
    if (collides) return;

    setSpots((current) => ({ ...current, [piece.id]: { x: drag.x, y: drag.y } }));
    startTransition(() => {
      void placeNode(piece.id, room.id, drag.x, drag.y);
    });
  }

  /** Colocar un mueble que todavía no está en el plano. */
  function place(node: RoomNode) {
    const shape = footprint(node.variant, node.rotation, { w: node.grid_w, h: node.grid_h });
    const free = firstFreeCell(shape.w, shape.h, placed);

    if (!free) return;

    startTransition(() => {
      void placeNode(node.id, room.id, free.x, free.y);
    });
  }

  function repaint(next: { wall?: string; floor?: string }) {
    if (next.wall) setWall(next.wall);
    if (next.floor) setFloor(next.floor);

    startTransition(() => {
      void paintRoom(room.id, next.wall ?? wall, next.floor ?? floor);
    });
  }

  const dragging = drag ? placed.find((piece) => piece.id === drag.id) : null;

  return (
    <div className="flex flex-col gap-4" style={{ "--tone": tone } as CSSProperties}>
      <div className="r-stage">
        <svg
          ref={svg}
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          className="w-full"
          role="img"
          aria-label={`Plano de ${room.name}`}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <Walls color={wall} />
          <Floor color={floor} grid={editing} />

          {/* Dónde va a caer lo que se está arrastrando. Va antes que los
              muebles para que ninguno lo tape. */}
          {drag && dragging ? (
            <Ghost x={drag.x} y={drag.y} w={dragging.w} h={dragging.h} />
          ) : null}

          {/* El orden del pintor: lo de atrás primero, o los muebles se
              recortan entre ellos al revés. */}
          {depthOrder(placed).map((piece) => {
            const live = drag?.id === piece.id;
            const shown = live && drag ? { ...piece, x: drag.x, y: drag.y } : piece;

            return (
              <g
                key={piece.id}
                onPointerDown={(event) => onDown(event, piece)}
                onClick={() => {
                  if (!editing) router.push(nodePath(piece.id));
                }}
                style={{ cursor: editing ? "grab" : "pointer", touchAction: "none" }}
                tabIndex={0}
                role={editing ? undefined : "link"}
                aria-label={`${piece.name}${
                  variantLabel("furniture", piece.variant)
                    ? ` · ${variantLabel("furniture", piece.variant)}`
                    : ""
                }`}
                onKeyDown={(event) => {
                  if (!editing && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    router.push(nodePath(piece.id));
                  }
                }}
              >
                <Furniture piece={shown} selected={live} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing((on) => !on)}
          className={`r-key min-h-12 flex-1 gap-2 text-[0.9375rem] ${editing ? "r-key-lit" : ""}`}
        >
          {editing ? <Check className="size-[1.125rem]" /> : <Pencil className="size-[1.125rem]" />}
          {editing ? "Listo" : "Acomodar"}
        </button>
      </div>

      {/* Lo que falta colocar. Solo mientras se acomoda: fuera de ese modo es
          una lista de pendientes que nadie pidió. */}
      {editing && loose.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="r-eyebrow px-1">Sin lugar en el plano</h2>
          <ul className="flex flex-wrap gap-2">
            {loose.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => place(node)}
                  className="r-chip"
                  style={{ "--tone": tone } as CSSProperties}
                >
                  <PlusSlot className="size-4" />
                  {node.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-1 text-[0.8125rem] text-[var(--r-ink-3)]">
            Tocá uno y entra contra la pared. Después se arrastra.
          </p>
        </section>
      ) : null}

      {editing ? (
        <>
          <Palette
            legend="Paredes"
            colors={WALL_COLORS}
            value={wall}
            onPick={(color) => repaint({ wall: color })}
          />
          <Palette
            legend="Piso"
            colors={FLOOR_COLORS}
            value={floor}
            onPick={(color) => repaint({ floor: color })}
          />

          {placed.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="r-eyebrow px-1">Sacar del plano</h2>
              <ul className="flex flex-wrap gap-2">
                {placed.map((piece) => (
                  <li key={piece.id}>
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(() => {
                          void unplaceNode(piece.id, room.id);
                        })
                      }
                      className="r-chip"
                    >
                      {piece.name}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="px-1 text-[0.8125rem] text-[var(--r-ink-3)]">
                Sacarlo del plano no lo borra: el mueble y todo lo que guarda siguen
                donde estaban.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {placed.length === 0 && loose.length === 0 ? (
        <p className="r-empty">
          Este cuarto todavía no tiene muebles. Agregá uno y después vení a ponerlo en
          su lugar.
        </p>
      ) : null}

      {!editing && placed.length === 0 && loose.length > 0 ? (
        <p className="r-empty">
          {loose.length === 1
            ? "Hay un mueble sin lugar en el plano. Tocá “Acomodar” para ponerlo."
            : `Hay ${loose.length} muebles sin lugar en el plano. Tocá “Acomodar” para ponerlos.`}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Palette({
  legend,
  colors,
  value,
  onPick,
}: {
  legend: string;
  colors: readonly string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="r-eyebrow px-1">{legend}</h2>
      <div className="flex flex-wrap gap-3">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onPick(color)}
            className="r-swatch"
            data-on={value === color}
            style={{ background: color }}
            aria-label={`${legend}: ${color}`}
            aria-pressed={value === color}
          />
        ))}
      </div>
    </section>
  );
}

export { COLS, ROWS };
