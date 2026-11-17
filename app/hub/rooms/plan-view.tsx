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
import { Check, Grid as GridIcon, PlusSlot, Refresh, Sliders, Spark, Trash } from "@/components/icons";
import {
  COLS,
  FLOORS,
  LIGHT_COLORS,
  PROPS,
  ROWS,
  VIEW_H,
  VIEW_W,
  WALL_COLORS,
  clampToFloor,
  depthOrder,
  firstFreeCell,
  fits,
  footprint,
  inside,
  overlaps,
  paintCell,
  propSkin,
  readFloor,
  safeLight,
  safeWall,
  shapeOf,
  toGrid,
  woodOf,
  type Floor,
  type Prop,
} from "@/lib/iso";
import { variantLabel, type RoomNode } from "@/lib/rooms";
import {
  addProp,
  dressRoom,
  paintRoomFloor,
  placeNode,
  removeProp,
  turnNode,
  turnProp,
  unplaceNode,
} from "./actions";
import { nodePath } from "./paths";
import {
  CANVAS,
  Floor as FloorLayer,
  Furniture,
  Ghost,
  PropGlow,
  PropSprite,
  Vacant,
  Walls,
  type Piece,
} from "./room-svg";

type Mode = "look" | "place" | "build";
type Tool =
  | { what: "thing"; kind: string }
  | { what: "floor"; key: Floor }
  | { what: "shape"; add: boolean };

/**
 * El cuarto, para mirarlo, acomodarlo y construirlo.
 *
 * Tres modos y una sola pantalla. Mirando, cada mueble es un enlace a lo que
 * guarda —que es el punto entero de la vista: tocar el armario y ver lo que
 * hay dentro—. Acomodando, los muebles se arrastran y se giran, y se apoyan
 * cosas encima. Construyendo, se cambia la forma del cuarto, el piso y la
 * pintura.
 *
 * Mezclarlos sería el error clásico: si tocar siempre moviera, abrir un
 * mueble sería imposible sin mover otro de paso; si tocar siempre pintara,
 * no se podría entrar a ningún lado.
 */
export function PlanView({
  room,
  furniture,
  props: things,
  tone,
}: {
  room: RoomNode;
  furniture: RoomNode[];
  props: Prop[];
  tone: string;
}) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);

  const [mode, setMode] = useState<Mode>("look");
  const [wall, setWall] = useState(() => safeWall(room.wall_color));
  const [light, setLight] = useState(() => safeLight(room.floor_color));
  const [tool, setTool] = useState<Tool>({ what: "thing", kind: "monitor" });
  const [picked, setPicked] = useState<string | null>(null);

  /*
    El plano y las cosas viven acá mientras dura el gesto. El servidor se
    entera al soltar, no en cada celda: un brochazo pinta diez casilleros
    mientras el dedo se mueve, y guardar cada uno sería diez escrituras para
    dejar la misma cadena.
  */
  const [plan, setPlan] = useState(() => readFloor(room.terrain));
  const [spots, setSpots] = useState<Record<string, { x: number; y: number }>>({});
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const painting = useRef(false);
  const capture = useRef<{ el: Element; id: number } | null>(null);

  const placed = useMemo(() => {
    return furniture
      .filter((node) => node.grid_x !== null && node.grid_y !== null)
      .map((node) => {
        const shape = footprint(node.variant, node.rotation, { w: node.grid_w, h: node.grid_h });
        const moved = spots[node.id];

        return {
          id: node.id,
          name: node.name,
          variant: node.variant,
          rotation: node.rotation,
          x: moved?.x ?? node.grid_x ?? 0,
          y: moved?.y ?? node.grid_y ?? 0,
          w: shape.w,
          h: shape.h,
          lift: shape.lift,
          top: shape.top,
          color: woodOf(node.variant),
        };
      });
  }, [furniture, spots]);

  const loose = furniture.filter((node) => node.grid_x === null || node.grid_y === null);
  const chosen = placed.find((piece) => piece.id === picked) ?? null;

  /**
   * La altura de la superficie en una celda.
   *
   * Es lo que pone el monitor SOBRE el escritorio en vez de adentro: si la
   * celda tiene un mueble con tapa, la cosa se levanta hasta ahí.
   */
  function baseAt(x: number, y: number) {
    const under = placed.find(
      (piece) => piece.top && overlaps({ x, y, w: 1, h: 1 }, piece)
    );

    return under?.lift ?? 0;
  }

  /** De las coordenadas del dedo a las del lienzo, sin importar la escala. */
  function toCanvas(event: ReactPointerEvent) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;

    return {
      sx: ((event.clientX - box.left) / box.width) * VIEW_W,
      sy: ((event.clientY - box.top) / box.height) * VIEW_H,
    };
  }

  /** La celda bajo el dedo, o null si cayó fuera de la grilla. */
  function cellAt(event: ReactPointerEvent) {
    const point = toCanvas(event);
    if (!point) return null;

    const raw = toGrid(point.sx, point.sy);
    const x = Math.floor(raw.x);
    const y = Math.floor(raw.y);

    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
    return { x, y };
  }

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

  function grab(event: ReactPointerEvent, el: Element) {
    // La captura ayuda pero no puede ser condición para que el gesto
    // arranque: si el navegador la rechaza, la excepción abortaba la función
    // antes de registrar nada y el arrastre moría ahí.
    try {
      el.setPointerCapture?.(event.pointerId);
      capture.current = { el, id: event.pointerId };
    } catch {
      capture.current = null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Acomodar                                                                */
  /* ---------------------------------------------------------------------- */

  function onPieceDown(event: ReactPointerEvent, piece: Piece) {
    if (mode !== "place") return;

    event.preventDefault();
    event.stopPropagation();

    grab(event, event.target as Element);
    setPicked(piece.id);
    setDrag({ id: piece.id, x: piece.x, y: piece.y });
  }

  /* ---------------------------------------------------------------------- */
  /* Poner y construir                                                       */
  /* ---------------------------------------------------------------------- */

  function apply(cell: { x: number; y: number }) {
    if (tool.what === "floor") {
      if (!inside(plan, cell.x, cell.y)) return;
      setPlan((current) => paintCell(current, cell.x, cell.y, tool.key));
      return;
    }

    if (tool.what === "shape") {
      if (tool.add) {
        setPlan((current) => paintCell(current, cell.x, cell.y, "w"));
        return;
      }

      // No se quita el piso de abajo de un mueble: el mueble quedaría
      // flotando sobre el vacío y no habría forma de agarrarlo.
      const busy =
        placed.some((piece) => overlaps({ ...cell, w: 1, h: 1 }, piece)) ||
        things.some((thing) => thing.grid_x === cell.x && thing.grid_y === cell.y);

      if (busy) return;
      setPlan((current) => paintCell(current, cell.x, cell.y, "."));
      return;
    }

    // Poner una cosa.
    if (!inside(plan, cell.x, cell.y)) return;

    const there = things.find((thing) => thing.grid_x === cell.x && thing.grid_y === cell.y);
    if (there) {
      startTransition(() => void removeProp(there.id, room.id));
      return;
    }

    const skin = propSkin(tool.kind);
    const base = baseAt(cell.x, cell.y);

    // Un monitor no se apoya en el piso y una alfombra no va sobre el
    // escritorio. La regla es la que hace que esto se sienta como un juego.
    if (skin.surface === "top" && base === 0) return;
    if (skin.surface === "floor" && base > 0) return;

    startTransition(() => void addProp(room.id, tool.kind, cell.x, cell.y));
  }

  function onStageDown(event: ReactPointerEvent) {
    if (mode === "look") return;

    const cell = cellAt(event);
    if (!cell) {
      setPicked(null);
      return;
    }

    if (mode === "place" && tool.what !== "thing") return;

    event.preventDefault();

    // Solo los pinceles siguen al dedo. Poner cosas arrastrando llenaría el
    // cuarto de monitores sin querer.
    if (mode === "build" && tool.what !== "thing") {
      painting.current = true;
      grab(event, event.currentTarget as Element);
    }

    apply(cell);
  }

  function onMove(event: ReactPointerEvent) {
    if (painting.current && tool.what !== "thing") {
      const cell = cellAt(event);
      if (cell) apply(cell);
      return;
    }

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

    if (painting.current) {
      painting.current = false;
      const saved = plan;
      startTransition(() => void paintRoomFloor(room.id, saved));
      return;
    }

    if (!drag) return;

    const piece = placed.find((item) => item.id === drag.id);
    setDrag(null);
    if (!piece) return;

    const spot = { x: drag.x, y: drag.y, w: piece.w, h: piece.h };

    // Ni encima de otro mueble ni fuera del cuarto: la pieza vuelve sola.
    if (!fits(plan, spot.x, spot.y, spot.w, spot.h)) return;
    if (placed.some((other) => other.id !== piece.id && overlaps(spot, other))) return;

    setSpots((current) => ({ ...current, [piece.id]: { x: drag.x, y: drag.y } }));
    startTransition(() => void placeNode(piece.id, room.id, drag.x, drag.y));
  }

  /** Colocar un mueble que todavía no está en el plano. */
  function place(node: RoomNode) {
    const shape = footprint(node.variant, node.rotation, { w: node.grid_w, h: node.grid_h });
    const free = firstFreeCell(plan, shape.w, shape.h, placed);
    if (!free) return;

    startTransition(() => void placeNode(node.id, room.id, free.x, free.y));
  }

  function dress(next: { wall?: string; light?: string }) {
    if (next.wall) setWall(next.wall);
    if (next.light) setLight(next.light);

    startTransition(() => void dressRoom(room.id, next.wall ?? wall, next.light ?? light));
  }

  const dragging = drag ? placed.find((piece) => piece.id === drag.id) : null;
  const badSpot =
    drag && dragging
      ? !fits(plan, drag.x, drag.y, dragging.w, dragging.h) ||
        placed.some((other) => other.id !== dragging.id && overlaps({ ...drag, w: dragging.w, h: dragging.h }, other))
      : false;

  return (
    <div className="flex flex-col gap-4" style={{ "--tone": tone, "--sky": light } as CSSProperties}>
      <div className="r-stage" data-mode={mode}>
        <svg
          ref={svg}
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          className="w-full"
          role="img"
          aria-label={`Plano de ${room.name}`}
          onPointerDown={onStageDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <Walls plan={plan} color={wall} />
          <FloorLayer plan={plan} grid={mode !== "look"} />
          {mode === "build" ? <Vacant plan={plan} /> : null}

          {/* La luz de las lámparas va sobre el piso y debajo de todo lo
              demás: es luz, no un objeto. */}
          {things.map((thing) => (
            <PropGlow key={`g${thing.id}`} kind={thing.variant} x={thing.grid_x} y={thing.grid_y} />
          ))}

          {drag && dragging ? (
            <Ghost x={drag.x} y={drag.y} w={dragging.w} h={dragging.h} bad={badSpot} />
          ) : null}

          {/* El orden del pintor, con muebles y cosas MEZCLADOS: si se
              dibujaran por separado, el monitor quedaría detrás del
              escritorio sobre el que está apoyado. */}
          {depthOrder([
            ...placed.map((piece) => ({
              kind: "piece" as const,
              piece,
              x: piece.x,
              y: piece.y,
              w: piece.w,
              h: piece.h,
              above: false,
            })),
            ...things.map((thing) => ({
              kind: "thing" as const,
              thing,
              x: thing.grid_x,
              y: thing.grid_y,
              w: 1,
              h: 1,
              above: baseAt(thing.grid_x, thing.grid_y) > 0,
            })),
          ]).map((entry) => {
            if (entry.kind === "thing") {
              const thing = entry.thing;

              return (
                <g
                  key={thing.id}
                  onPointerDown={(event) => {
                    if (mode !== "place") return;
                    event.stopPropagation();
                    setPicked(`thing:${thing.id}`);
                  }}
                  style={{ cursor: mode === "place" ? "pointer" : "default" }}
                  aria-label={propSkin(thing.variant).label}
                >
                  <PropSprite
                    kind={thing.variant}
                    x={thing.grid_x}
                    y={thing.grid_y}
                    seed={thing.seed}
                    rotation={thing.rotation}
                    base={baseAt(thing.grid_x, thing.grid_y)}
                  />
                </g>
              );
            }

            const piece = entry.piece;
            const live = drag?.id === piece.id;
            const shown = live && drag ? { ...piece, x: drag.x, y: drag.y } : piece;

            return (
              <g
                key={piece.id}
                onPointerDown={(event) => onPieceDown(event, piece)}
                onClick={() => {
                  if (mode === "look") router.push(nodePath(piece.id));
                }}
                style={{ cursor: mode === "place" ? "grab" : "pointer", touchAction: "none" }}
                tabIndex={0}
                role={mode === "look" ? "link" : undefined}
                aria-label={`${piece.name}${
                  variantLabel("furniture", piece.variant)
                    ? ` · ${variantLabel("furniture", piece.variant)}`
                    : ""
                }`}
                onKeyDown={(event) => {
                  if (mode === "look" && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    router.push(nodePath(piece.id));
                  }
                }}
              >
                <Furniture piece={shown} selected={picked === piece.id || live} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* La barra de modos: tres botones que dicen qué hace el dedo. */}
      <div className="r-modes" role="tablist" aria-label="Qué hacer en el cuarto">
        {([
          ["look", "Mirar", <Spark key="i" className="size-[1.125rem]" />],
          ["place", "Acomodar", <Sliders key="i" className="size-[1.125rem]" />],
          ["build", "Construir", <GridIcon key="i" className="size-[1.125rem]" />],
        ] as const).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setPicked(null);
              if (key === "build") setTool({ what: "floor", key: "w" });
              if (key === "place") setTool({ what: "thing", kind: "monitor" });
            }}
            className="r-mode"
            data-on={mode === key}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {mode === "look" ? (
        <p className="r-hint">
          {placed.length === 0
            ? "Todavía no hay muebles en el cuarto. Tocá “Acomodar” para ponerlos."
            : "Tocá un mueble para ver lo que guarda."}
        </p>
      ) : null}

      {/* La barra del mueble elegido: girar y sacar, sobre lo que se tocó. */}
      {mode === "place" && chosen ? (
        <div className="r-card flex items-center gap-2 p-2">
          <span className="r-eyebrow min-w-0 flex-1 truncate px-1">{chosen.name}</span>
          <button
            type="button"
            onClick={() => startTransition(() => void turnNode(chosen.id, room.id, chosen.rotation))}
            className="r-ico"
            aria-label={`Girar ${chosen.name}`}
          >
            <Refresh className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              startTransition(() => void unplaceNode(chosen.id, room.id));
              setPicked(null);
            }}
            className="r-ico"
            aria-label={`Sacar ${chosen.name} del cuarto`}
          >
            <Trash className="size-4" />
          </button>
        </div>
      ) : null}

      {mode === "place" && picked?.startsWith("thing:") ? (
        <ThingBar
          id={picked.slice(6)}
          things={things}
          roomId={room.id}
          onDone={() => setPicked(null)}
        />
      ) : null}

      {mode === "place" ? (
        <>
          <p className="r-hint">
            Arrastrá los muebles para moverlos y tocalos para girarlos. Las cosas se ponen
            tocando el suelo — o el escritorio, si van encima.
          </p>

          <Shelf title="Poner cosas">
            {PROPS.map((skin) => (
              <button
                key={skin.key}
                type="button"
                onClick={() => setTool({ what: "thing", kind: skin.key })}
                className="r-chip"
                data-on={tool.what === "thing" && tool.kind === skin.key}
              >
                {skin.label}
                {skin.surface === "top" ? <span className="r-tag">encima</span> : null}
              </button>
            ))}
          </Shelf>

          {loose.length > 0 ? (
            <Shelf title="Muebles sin lugar">
              {loose.map((node) => (
                <button key={node.id} type="button" onClick={() => place(node)} className="r-chip">
                  <PlusSlot className="size-4" />
                  {node.name}
                </button>
              ))}
            </Shelf>
          ) : null}
        </>
      ) : null}

      {mode === "build" ? (
        <>
          <p className="r-hint">
            {tool.what === "shape"
              ? tool.add
                ? "Deslizá para agrandar el cuarto."
                : "Deslizá para recortar. Donde hay un mueble no se puede."
              : "Deslizá el dedo para cambiar el piso."}
          </p>

          <Shelf title="La forma del cuarto" note="Así se hacen los cuartos en L, o con el rincón mordido donde está la puerta.">
            <button
              type="button"
              onClick={() => setTool({ what: "shape", add: true })}
              className="r-chip"
              data-on={tool.what === "shape" && tool.add}
            >
              <PlusSlot className="size-4" />
              Agrandar
            </button>
            <button
              type="button"
              onClick={() => setTool({ what: "shape", add: false })}
              className="r-chip"
              data-on={tool.what === "shape" && !tool.add}
            >
              <Trash className="size-4" />
              Recortar
            </button>
          </Shelf>

          <Shelf title="El piso">
            {FLOORS.map((skin) => (
              <button
                key={skin.key}
                type="button"
                onClick={() => setTool({ what: "floor", key: skin.key })}
                className="r-chip r-chip-ink"
                data-on={tool.what === "floor" && tool.key === skin.key}
                style={{ "--ink": skin.top } as CSSProperties}
              >
                <span className="r-swatch-dot" />
                {skin.label}
              </button>
            ))}
          </Shelf>

          <Palette legend="La pintura" colors={WALL_COLORS} value={wall} onPick={(c) => dress({ wall: c })} />
          <Palette legend="La luz" colors={LIGHT_COLORS} value={light} onPick={(c) => dress({ light: c })} />
        </>
      ) : null}

      {mode !== "look" ? (
        <button
          type="button"
          onClick={() => {
            setMode("look");
            setPicked(null);
          }}
          className="r-key r-key-lit gap-2"
        >
          <Check className="size-[1.125rem]" />
          Listo
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** La barra de la cosa elegida: girarla o sacarla. */
function ThingBar({
  id,
  things,
  roomId,
  onDone,
}: {
  id: string;
  things: Prop[];
  roomId: string;
  onDone: () => void;
}) {
  const thing = things.find((item) => item.id === id);
  if (!thing) return null;

  const skin = propSkin(thing.variant);

  return (
    <div className="r-card flex items-center gap-2 p-2">
      <span className="r-eyebrow min-w-0 flex-1 truncate px-1">{skin.label}</span>
      <button
        type="button"
        onClick={() => startTransition(() => void turnProp(thing.id, roomId, thing.rotation))}
        className="r-ico"
        aria-label={`Girar ${skin.label}`}
      >
        <Refresh className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          startTransition(() => void removeProp(thing.id, roomId));
          onDone();
        }}
        className="r-ico"
        aria-label={`Sacar ${skin.label}`}
      >
        <Trash className="size-4" />
      </button>
    </div>
  );
}

function Shelf({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="r-eyebrow px-1">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note ? <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--r-ink-3)]">{note}</p> : null}
    </section>
  );
}

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
      <div className="flex flex-wrap gap-2.5">
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

export { shapeOf };
