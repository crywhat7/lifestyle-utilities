import { Fragment } from "react";
import {
  COLS,
  ROWS,
  SLAB_H,
  TILE_H,
  TILE_W,
  VIEW_H,
  VIEW_W,
  WALL_H,
  edgesOf,
  floorAt,
  floorSkin,
  inside,
  noise,
  propSkin,
  tilePoints,
  toScreen,
  wallPoint,
  wallsOf,
  type WallSide,
} from "@/lib/iso";

/**
 * El cuarto dibujado: paredes, piso, muebles y cosas.
 *
 * Todo son polígonos calculados, cero imágenes. Eso es lo que permite pintar
 * una pared con el color que elija la persona sin re-exportar nada, y que un
 * escritorio pese lo que pesan ocho polígonos.
 *
 * Hay una sola regla de luz y se aplica en TODAS partes: la cara de arriba
 * recibe la luz entera, la izquierda algo menos y la derecha es la sombra.
 * Sin esa diferencia constante, un cubo isométrico se ve como un hexágono
 * plano y el cuarto pierde el volumen de golpe.
 *
 * Las mezclas van en sRGB y no en OKLCH a propósito: el negro y el blanco
 * son acromáticos, y al interpolarlos en un espacio polar el resultado sale
 * con `hue: none`, o sea gris. Ya costó un bug —todas las paredes salían del
 * mismo gris rosado sin importar el color elegido— y no vale la pena
 * repetirlo por un degradado más bonito en el papel.
 */

/** Oscurecer: 1 es el color tal cual, 0.6 es sombra. */
export function dim(color: string, amount: number) {
  return `color-mix(in srgb, ${color} ${Math.round(amount * 100)}%, #000000)`;
}

/** Aclarar hacia la luz. */
export function lift(color: string, amount: number) {
  return `color-mix(in srgb, #ffffff ${Math.round(amount * 100)}%, ${color})`;
}

/** Las tres caras de un mismo color. */
export function shade(color: string) {
  return { top: color, left: dim(color, 0.84), right: dim(color, 0.66) };
}

export const CANVAS = { width: VIEW_W, height: VIEW_H };

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/* -------------------------------------------------------------------------- */
/* Las paredes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Las paredes del cuarto, calculadas a partir de la forma del piso.
 *
 * No hay una lista de paredes en ningún lado: una pared existe donde una
 * celda con piso toca el vacío por detrás. Un cuarto en L tiene sus paredes
 * en L sin que nadie las dibuje, y morder una esquina para la puerta mueve
 * la pared sola.
 *
 * Se dibujan ANTES que el piso porque están detrás de todo. El degradado de
 * arriba hacia abajo es lo que hace que no se vean como cartón: una pared
 * real recibe más luz cerca del techo.
 */
export function Walls({ plan, color }: { plan: string; color: string }) {
  const faces = shade(color);
  const segments = wallsOf(plan);

  return (
    <g>
      <defs>
        <linearGradient id="wall-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lift(faces.left, 0.12)} />
          <stop offset="100%" stopColor={dim(faces.left, 0.88)} />
        </linearGradient>
        <linearGradient id="wall-r" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lift(faces.right, 0.1)} />
          <stop offset="100%" stopColor={dim(faces.right, 0.9)} />
        </linearGradient>
      </defs>

      {segments.map((wall) => (
        <WallSlab key={`${wall.x}-${wall.y}-${wall.side}`} wall={wall} color={color} />
      ))}
    </g>
  );
}

function WallSlab({
  wall,
  color,
}: {
  wall: { x: number; y: number; side: WallSide };
  color: string;
}) {
  const { x, y, side } = wall;

  // El borde de atrás de la celda, que es donde se apoya la pared.
  const a = toScreen(x, y);
  const b = side === "left" ? toScreen(x, y + 1) : toScreen(x + 1, y);

  const up = (p: { sx: number; sy: number }) => `${p.sx},${p.sy - WALL_H}`;
  const flat = (p: { sx: number; sy: number }) => `${p.sx},${p.sy}`;

  const skirting = 8;
  const faces = shade(color);

  return (
    <g>
      <polygon
        points={`${flat(a)} ${flat(b)} ${up(b)} ${up(a)}`}
        fill={`url(#wall-${side === "left" ? "l" : "r"})`}
      />

      {/* El zócalo. Es la pieza que dice "esto es un cuarto": sin esa franja
          al pie, la pared y el piso se funden en una sola mancha. */}
      <polygon
        points={`${a.sx},${a.sy - skirting} ${b.sx},${b.sy - skirting} ${flat(b)} ${flat(a)}`}
        fill={side === "left" ? dim(faces.left, 0.74) : dim(faces.right, 0.74)}
      />

      {/* El filo de arriba, donde la pared termina y entra la luz. */}
      <line
        x1={a.sx}
        y1={a.sy - WALL_H}
        x2={b.sx}
        y2={b.sy - WALL_H}
        stroke={lift(color, 0.35)}
        strokeWidth={2}
      />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* El piso                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * El suelo, celda por celda, y el canto donde el cuarto termina.
 *
 * Cada material se dibuja distinto: la madera lleva tablas en diagonal, la
 * baldosa se parte en cuatro, la alfombra tiene pelusa y el cemento sus
 * manchas. A la escala de una celda eso es lo único que los distingue — dos
 * grises parecidos no se diferencian.
 */
export function Floor({ plan, grid }: { plan: string; grid: boolean }) {
  const cells = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!inside(plan, x, y)) continue;
      cells.push(<Cell key={`${x}-${y}`} plan={plan} x={x} y={y} />);
    }
  }

  return (
    <g>
      <Edges plan={plan} />
      {cells}
      {grid ? <Grid plan={plan} /> : null}
    </g>
  );
}

function Cell({ plan, x, y }: { plan: string; x: number; y: number }) {
  const key = floorAt(plan, x, y);
  const skin = floorSkin(key);
  const { sx, sy } = toScreen(x, y);

  return (
    <g>
      <polygon points={tilePoints(x, y)} fill={skin.top} />
      <Material kind={key} skin={skin} x={x} y={y} cx={sx} cy={sy} />
    </g>
  );
}

/** Lo que hace que una baldosa no sea una alfombra. */
function Material({
  kind,
  skin,
  x,
  y,
  cx,
  cy,
}: {
  kind: string;
  skin: { top: string; fleck: string; rim: string };
  x: number;
  y: number;
  cx: number;
  cy: number;
}) {
  if (kind === "w") {
    // Tablas: tres líneas paralelas a una diagonal, con una junta más marcada
    // cada tantas celdas para que no se vea un enrejado perfecto.
    const planks = [0.25, 0.5, 0.75].map((t) => {
      const ax = cx - HALF_W + HALF_W * t;
      const ay = cy + HALF_H * t;
      const bx = cx + HALF_W * t;
      const by = cy + TILE_H - HALF_H * t;

      return (
        <line
          key={t}
          x1={ax}
          y1={ay}
          x2={bx}
          y2={by}
          stroke={skin.fleck}
          strokeWidth={1}
          opacity={0.7}
        />
      );
    });

    return (
      <g>
        {planks}
        {noise(x, y, 2) > 0.6 ? (
          <polygon points={tilePoints(x, y)} fill={dim(skin.top, 0.93)} opacity={0.5} />
        ) : null}
      </g>
    );
  }

  if (kind === "t") {
    // Cuatro baldosas por celda, en damero.
    const quads = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([qx, qy], i) => {
      const a = toScreen(x + qx * 0.5, y + qy * 0.5);
      const hw = HALF_W / 2;
      const hh = HALF_H / 2;

      return (
        <polygon
          key={i}
          points={`${a.sx},${a.sy} ${a.sx + hw},${a.sy + hh} ${a.sx},${a.sy + TILE_H / 2} ${a.sx - hw},${a.sy + hh}`}
          fill={(qx + qy) % 2 === 0 ? lift(skin.top, 0.1) : dim(skin.top, 0.95)}
          stroke={skin.fleck}
          strokeWidth={0.6}
        />
      );
    });

    return <g>{quads}</g>;
  }

  if (kind === "c") {
    // Pelusa: muchos puntitos cortos, sin juntas.
    const fuzz = [];
    for (let i = 0; i < 7; i += 1) {
      const n = noise(x, y, i);
      if (n < 0.3) continue;

      const u = noise(x, y, i + 20) - 0.5;
      const v = noise(x, y, i + 40) - 0.5;

      fuzz.push(
        <rect
          key={i}
          x={cx + (u - v) * HALF_W * 1.5 - 1}
          y={cy + HALF_H + (u + v) * HALF_H * 1.5}
          width={2}
          height={2}
          fill={n > 0.7 ? skin.rim : skin.fleck}
          opacity={0.6}
        />
      );
    }

    return <g>{fuzz}</g>;
  }

  // Cemento: manchas grandes y alguna grieta.
  const marks = [];
  for (let i = 0; i < 3; i += 1) {
    const n = noise(x, y, i + 5);
    if (n < 0.5) continue;

    const u = noise(x, y, i + 25) - 0.5;
    const v = noise(x, y, i + 45) - 0.5;

    marks.push(
      <ellipse
        key={i}
        cx={cx + (u - v) * HALF_W}
        cy={cy + HALF_H + (u + v) * HALF_H}
        rx={6 + n * 6}
        ry={3 + n * 3}
        fill={skin.fleck}
        opacity={0.35}
      />
    );
  }

  return <g>{marks}</g>;
}

/** El espesor del piso, visible donde el cuarto termina. */
function Edges({ plan }: { plan: string }) {
  return (
    <g>
      {edgesOf(plan).map(({ x, y, side }) => {
        const skin = floorSkin(floorAt(plan, x, y));
        const a = side === "right" ? toScreen(x + 1, y) : toScreen(x, y + 1);
        const b = toScreen(x + 1, y + 1);

        return (
          <polygon
            key={`${x}-${y}-${side}`}
            points={`${a.sx},${a.sy} ${b.sx},${b.sy} ${b.sx},${b.sy + SLAB_H} ${a.sx},${a.sy + SLAB_H}`}
            fill={side === "right" ? dim(skin.fleck, 0.66) : dim(skin.fleck, 0.82)}
          />
        );
      })}
    </g>
  );
}

/** La retícula, solo mientras se construye. Fuera de ese momento es ruido. */
function Grid({ plan }: { plan: string }) {
  const lines = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!inside(plan, x, y)) continue;
      lines.push(
        <polygon
          key={`${x}-${y}`}
          points={tilePoints(x, y)}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.25}
          strokeWidth={1}
        />
      );
    }
  }

  return <g pointerEvents="none">{lines}</g>;
}

/**
 * Las celdas vacías, dibujadas como un contorno fantasma.
 *
 * Solo mientras se construye: es lo que muestra hasta dónde se PUEDE
 * agrandar el cuarto. Sin ellas, ampliar sería adivinar dónde tocar.
 */
export function Vacant({ plan }: { plan: string }) {
  const ghosts = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (inside(plan, x, y)) continue;
      ghosts.push(
        <polygon
          key={`${x}-${y}`}
          points={tilePoints(x, y)}
          fill="#ffffff"
          fillOpacity={0.05}
          stroke="#ffffff"
          strokeOpacity={0.18}
          strokeDasharray="4 4"
        />
      );
    }
  }

  return <g pointerEvents="none">{ghosts}</g>;
}

/* -------------------------------------------------------------------------- */
/* Los muebles                                                                 */
/* -------------------------------------------------------------------------- */

export type Piece = {
  id: string;
  name: string;
  variant: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  lift: number;
  color: string;
};

/**
 * Un mueble.
 *
 * La caja isométrica es la base de todos, pero no alcanza: un escritorio con
 * patas y un armario macizo se leen distinto de un vistazo, y esa diferencia
 * es la que hace que el plano se parezca a un cuarto. Así que la caja es una
 * primitiva y cada tipo le agrega lo suyo — patas, puertas, gavetas, un
 * colchón.
 */
export function Furniture({ piece, selected }: { piece: Piece; selected?: boolean }) {
  const legged = piece.variant === "desk" || piece.variant === "table";

  return (
    <g>
      <Blob piece={piece} />
      {legged ? <Legged piece={piece} /> : <Solid piece={piece} />}
      {selected ? <Outline piece={piece} /> : null}
    </g>
  );
}

/** La sombra que apoya el mueble en el piso. */
function Blob({ piece }: { piece: Piece }) {
  const a = toScreen(piece.x, piece.y);
  const c = toScreen(piece.x + piece.w, piece.y + piece.h);

  return (
    <ellipse
      cx={(a.sx + c.sx) / 2}
      cy={(a.sy + c.sy) / 2 + HALF_H}
      rx={(piece.w + piece.h) * 13}
      ry={(piece.w + piece.h) * 6.5}
      fill="#000000"
      opacity={0.22}
    />
  );
}

/** Un mueble macizo: armario, cómoda, cama, baúl. */
function Solid({ piece }: { piece: Piece }) {
  const faces = shade(piece.color);
  const tall = piece.lift;

  const back = toScreen(piece.x, piece.y);
  const right = toScreen(piece.x + piece.w, piece.y);
  const front = toScreen(piece.x + piece.w, piece.y + piece.h);
  const left = toScreen(piece.x, piece.y + piece.h);

  const up = (p: { sx: number; sy: number }) => `${p.sx},${p.sy - tall}`;
  const flat = (p: { sx: number; sy: number }) => `${p.sx},${p.sy}`;

  return (
    <g>
      <polygon points={`${flat(left)} ${flat(front)} ${up(front)} ${up(left)}`} fill={faces.left} />
      <polygon points={`${flat(front)} ${flat(right)} ${up(right)} ${up(front)}`} fill={faces.right} />
      <polygon points={`${up(back)} ${up(right)} ${up(front)} ${up(left)}`} fill={faces.top} />

      <polyline
        points={`${up(left)} ${up(back)} ${up(right)}`}
        fill="none"
        stroke={lift(piece.color, 0.28)}
        strokeWidth={2}
      />

      <Face piece={piece} />
    </g>
  );
}

/** Un mueble con patas: escritorio, mesa. La tabla arriba y cuatro palos. */
function Legged({ piece }: { piece: Piece }) {
  const faces = shade(piece.color);
  const tall = piece.lift;
  const slab = 8;

  const back = toScreen(piece.x, piece.y);
  const right = toScreen(piece.x + piece.w, piece.y);
  const front = toScreen(piece.x + piece.w, piece.y + piece.h);
  const left = toScreen(piece.x, piece.y + piece.h);

  const at = (p: { sx: number; sy: number }, up: number) => `${p.sx},${p.sy - up}`;

  // Las cuatro patas, un poco metidas hacia adentro.
  const inset = 0.18;
  const legs: [number, number][] = [
    [piece.x + inset, piece.y + inset],
    [piece.x + piece.w - inset, piece.y + inset],
    [piece.x + inset, piece.y + piece.h - inset],
    [piece.x + piece.w - inset, piece.y + piece.h - inset],
  ];

  return (
    <g>
      {legs.map(([lx, ly], i) => {
        const p = toScreen(lx, ly);
        return (
          <rect
            key={i}
            x={p.sx - 3}
            y={p.sy + HALF_H - tall}
            width={6}
            height={tall}
            fill={faces.right}
          />
        );
      })}

      {/* La tabla. */}
      <polygon
        points={`${at(left, tall)} ${at(front, tall)} ${at(front, tall - slab)} ${at(left, tall - slab)}`}
        fill={faces.left}
      />
      <polygon
        points={`${at(front, tall)} ${at(right, tall)} ${at(right, tall - slab)} ${at(front, tall - slab)}`}
        fill={faces.right}
      />
      <polygon
        points={`${at(back, tall)} ${at(right, tall)} ${at(front, tall)} ${at(left, tall)}`}
        fill={faces.top}
      />
      <polyline
        points={`${at(left, tall)} ${at(back, tall)} ${at(right, tall)}`}
        fill="none"
        stroke={lift(piece.color, 0.3)}
        strokeWidth={2}
      />
    </g>
  );
}

/**
 * Lo que convierte una caja en un mueble: puertas, gavetas, un colchón.
 *
 * Va sobre la cara izquierda, que es la que queda de frente al mirar.
 */
function Face({ piece }: { piece: Piece }) {
  const tall = piece.lift;
  const left = toScreen(piece.x, piece.y + piece.h);
  const front = toScreen(piece.x + piece.w, piece.y + piece.h);

  /** Un punto sobre la cara frontal: `t` a lo ancho, `u` a lo alto. */
  const on = (t: number, u: number) => ({
    x: left.sx + (front.sx - left.sx) * t,
    y: left.sy + (front.sy - left.sy) * t - tall * u,
  });

  const ink = "rgba(0,0,0,0.3)";
  const glint = "rgba(255,255,255,0.35)";

  switch (piece.variant) {
    case "wardrobe":
    case "cabinet": {
      const split = on(0.5, 0);
      const splitTop = on(0.5, 1);
      const h1 = on(0.42, 0.52);
      const h2 = on(0.58, 0.52);

      return (
        <g>
          <line x1={split.x} y1={split.y} x2={splitTop.x} y2={splitTop.y} stroke={ink} strokeWidth={2} />
          <circle cx={h1.x} cy={h1.y} r={2.5} fill={glint} />
          <circle cx={h2.x} cy={h2.y} r={2.5} fill={glint} />
        </g>
      );
    }

    case "dresser":
    case "nightstand": {
      const rows = piece.variant === "dresser" ? [0.28, 0.56, 0.84] : [0.5];

      return (
        <g>
          {rows.map((u) => {
            const a = on(0.1, u);
            const b = on(0.9, u);
            const knob = on(0.5, u - 0.1);

            return (
              <Fragment key={u}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ink} strokeWidth={2} />
                <circle cx={knob.x} cy={knob.y} r={2.5} fill={glint} />
              </Fragment>
            );
          })}
        </g>
      );
    }

    case "shelf": {
      // Los estantes se ven como huecos oscuros, no como líneas.
      return (
        <g>
          {[0.2, 0.46, 0.72].map((u) => {
            const a = on(0.08, u);
            const b = on(0.92, u);
            const a2 = on(0.08, u + 0.18);
            const b2 = on(0.92, u + 0.18);

            return (
              <polygon
                key={u}
                points={`${a.x},${a.y} ${b.x},${b.y} ${b2.x},${b2.y} ${a2.x},${a2.y}`}
                fill="rgba(0,0,0,0.28)"
              />
            );
          })}
        </g>
      );
    }

    case "trunk": {
      const a = on(0, 0.6);
      const b = on(1, 0.6);
      const latch = on(0.5, 0.45);

      return (
        <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ink} strokeWidth={2.5} />
          <rect x={latch.x - 3} y={latch.y - 3} width={6} height={7} rx={1} fill={glint} />
        </g>
      );
    }

    case "bed": {
      // El colchón y la almohada van sobre la tapa, no sobre la cara.
      const pa = toScreen(piece.x + 0.12, piece.y + 0.12);
      const pb = toScreen(piece.x + piece.w - 0.12, piece.y + 0.12);
      const pc = toScreen(piece.x + piece.w - 0.12, piece.y + 0.85);
      const pd = toScreen(piece.x + 0.12, piece.y + 0.85);

      const qa = toScreen(piece.x + 0.12, piece.y + 0.95);
      const qb = toScreen(piece.x + piece.w - 0.12, piece.y + 0.95);
      const qc = toScreen(piece.x + piece.w - 0.12, piece.y + piece.h - 0.1);
      const qd = toScreen(piece.x + 0.12, piece.y + piece.h - 0.1);

      return (
        <g>
          <polygon
            points={`${qa.sx},${qa.sy - tall} ${qb.sx},${qb.sy - tall} ${qc.sx},${qc.sy - tall} ${qd.sx},${qd.sy - tall}`}
            fill="#d8d2e8"
          />
          <polygon
            points={`${pa.sx},${pa.sy - tall} ${pb.sx},${pb.sy - tall} ${pc.sx},${pc.sy - tall} ${pd.sx},${pd.sy - tall}`}
            fill="#f4f0fa"
          />
        </g>
      );
    }

    default:
      return null;
  }
}

function Outline({ piece }: { piece: Piece }) {
  const tall = piece.lift;
  const back = toScreen(piece.x, piece.y);
  const right = toScreen(piece.x + piece.w, piece.y);
  const front = toScreen(piece.x + piece.w, piece.y + piece.h);
  const left = toScreen(piece.x, piece.y + piece.h);
  const up = (p: { sx: number; sy: number }) => `${p.sx},${p.sy - tall}`;

  return (
    <polygon
      points={`${up(back)} ${up(right)} ${up(front)} ${up(left)}`}
      fill="none"
      stroke="var(--r-gold, #e8b65c)"
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

/** El fantasma de dónde va a caer lo que se está arrastrando. */
export function Ghost({
  x,
  y,
  w,
  h,
  bad,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  bad?: boolean;
}) {
  const back = toScreen(x, y);
  const right = toScreen(x + w, y);
  const front = toScreen(x + w, y + h);
  const left = toScreen(x, y + h);

  return (
    <polygon
      points={`${back.sx},${back.sy} ${right.sx},${right.sy} ${front.sx},${front.sy} ${left.sx},${left.sy}`}
      fill={bad ? "#d4504f" : "#ffffff"}
      fillOpacity={0.3}
      stroke={bad ? "#d4504f" : "#ffffff"}
      strokeWidth={2}
      strokeDasharray="6 4"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Las cosas                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Las catorce cosas que no guardan nada.
 *
 * Cada una está dibujada con las primitivas más simples que la hacen
 * reconocible de un vistazo: un monitor es una pantalla con pie, los
 * auriculares son un arco con dos tazas, una caja es un cubo con cinta. La
 * gracia no está en el detalle sino en la silueta — a esta escala es lo
 * único que se lee.
 *
 * `base` es la altura del mueble sobre el que está apoyada: eso es lo que
 * pone el monitor SOBRE el escritorio en vez de adentro.
 */
export function PropSprite({
  kind,
  x,
  y,
  seed,
  rotation,
  base,
}: {
  kind: string;
  x: number;
  y: number;
  seed: number;
  rotation: number;
  base: number;
}) {
  const skin = propSkin(kind);
  const { sx, sy } = toScreen(x, y);
  const fx = sx;
  const fy = sy + HALF_H - base;

  // Girar en isométrico no es rotar el dibujo: es espejarlo. Un cuarto de
  // vuelta cambia qué cara mira al frente, y con siluetas tan chicas el
  // espejo lee mejor que una rotación que las deformaría.
  const flip = rotation === 90 || rotation === 180 ? -1 : 1;

  return (
    <g transform={`translate(${fx} ${fy})`}>
      {base === 0 ? <ellipse cx={0} cy={0} rx={15} ry={6.5} fill="#000000" opacity={0.2} /> : null}
      <g transform={`scale(${flip} 1)`}>
        <Sprite kind={skin.key} seed={seed} x={x} y={y} />
      </g>
    </g>
  );
}

function Sprite({ kind, seed, x, y }: { kind: string; seed: number; x: number; y: number }) {
  const n = (salt: number) => noise(x, y, seed + salt);

  switch (kind) {
    case "monitor":
      return (
        <g>
          <rect x={-3} y={-10} width={6} height={10} fill="#43474f" />
          <rect x={-11} y={-6} width={22} height={3} rx={1.5} fill="#3a3e45" />
          <rect x={-18} y={-40} width={36} height={30} rx={3} fill="#2c2f36" />
          <rect x={-15} y={-37} width={30} height={24} rx={2} fill="#6fc7e8" />
          <polygon points="-15,-37 -4,-37 -15,-22" fill="#9fdcf2" opacity={0.55} />
        </g>
      );

    case "keyboard":
      return (
        <g>
          <polygon points="-18,0 0,-6 18,0 0,6" fill="#3f434b" />
          <polygon points="-14,-0.5 0,-5 14,-0.5 0,4" fill="#5a5f69" />
        </g>
      );

    case "headphones":
      return (
        <g>
          <path d="M -12 -4 a 12 14 0 0 1 24 0" fill="none" stroke="#3f434b" strokeWidth={4} strokeLinecap="round" />
          <rect x={-16} y={-7} width={8} height={11} rx={3} fill="#2c2f36" />
          <rect x={8} y={-7} width={8} height={11} rx={3} fill="#2c2f36" />
          <rect x={-15} y={-5} width={3} height={7} rx={1.5} fill="#6fc7e8" opacity={0.8} />
        </g>
      );

    case "pc":
      return (
        <g>
          <polygon points="-11,-6 0,-12 11,-6 0,0" fill="#4a4f58" />
          <polygon points="-11,-6 0,0 0,-44 -11,-50" fill="#363a42" />
          <polygon points="11,-6 0,0 0,-44 11,-50" fill="#2a2d34" />
          <polygon points="-11,-50 0,-56 11,-50 0,-44" fill="#4a4f58" />
          <rect x={-8} y={-40} width={3} height={22} rx={1.5} fill="#7ce7ff" opacity={0.75} />
        </g>
      );

    case "books":
      return (
        <g>
          {[0, 1, 2].map((i) => {
            const colors = ["#c1543f", "#3f7bc1", "#c9a227"];
            return (
              <rect
                key={i}
                x={-10 + i * 7}
                y={-18 - n(i) * 5}
                width={6}
                height={18 + n(i) * 5}
                rx={1}
                fill={colors[i]}
              />
            );
          })}
        </g>
      );

    case "box":
      return (
        <g>
          <polygon points="-15,-8 0,-16 15,-8 0,0" fill="#c9a06a" />
          <polygon points="-15,-8 0,0 0,-20 -15,-28" fill="#a8824f" />
          <polygon points="15,-8 0,0 0,-20 15,-28" fill="#8d6c40" />
          <polygon points="-15,-28 0,-36 15,-28 0,-20" fill="#d8b079" />
          <line x1={-15} y1={-28} x2={0} y2={-20} stroke="#e8d3ad" strokeWidth={2.5} />
          <line x1={15} y1={-28} x2={0} y2={-20} stroke="#e8d3ad" strokeWidth={2.5} />
        </g>
      );

    case "basket":
      return (
        <g>
          <polygon points="-13,-6 0,-12 13,-6 0,0" fill="#8a6244" />
          <polygon points="-13,-6 0,0 0,-20 -13,-26" fill="#a87f55" />
          <polygon points="13,-6 0,0 0,-20 13,-26" fill="#73523a" />
          <ellipse cx={0} cy={-26} rx={13} ry={6} fill="#2e2a24" />
          <path d="M -9 -22 q 9 5 18 0" stroke="#6fc7e8" strokeWidth={2} fill="none" opacity={0.6} />
        </g>
      );

    case "plant":
      return (
        <g>
          <polygon points="-9,-4 9,-4 7,-20 -7,-20" fill="#b06a4a" />
          <polygon points="-7,-20 7,-20 6,-24 -6,-24" fill="#c97d59" />
          <path d="M 0 -24 q -14 -8 -10 -24" stroke="#3f8f52" strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M 0 -24 q 13 -10 9 -26" stroke="#4aa85f" strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M 0 -24 q 2 -16 -2 -28" stroke="#58bd6d" strokeWidth={4} fill="none" strokeLinecap="round" />
          <ellipse cx={-10} cy={-48} rx={6} ry={4} fill="#4aa85f" />
          <ellipse cx={9} cy={-50} rx={6} ry={4} fill="#58bd6d" />
          <ellipse cx={-2} cy={-54} rx={5} ry={4} fill="#3f8f52" />
        </g>
      );

    case "lamp":
      return (
        <g>
          <ellipse cx={0} cy={-2} rx={11} ry={5} fill="#4a4036" />
          <rect x={-2} y={-66} width={4} height={64} fill="#5c5042" />
          <polygon points="-14,-66 14,-66 9,-84 -9,-84" fill="#ffe2ad" />
          <polygon points="-14,-66 0,-66 0,-84 -9,-84" fill="#fff2d6" opacity={0.7} />
        </g>
      );

    case "chair":
      return (
        <g>
          {[[-9, -3], [9, -3], [-5, 5], [5, 5]].map(([lx, ly], i) => (
            <rect key={i} x={lx - 2} y={ly - 22} width={4} height={22} fill="#7b5637" />
          ))}
          <polygon points="-13,-22 0,-28 13,-22 0,-16" fill="#a8824f" />
          <polygon points="-13,-22 -13,-46 -4,-50 -4,-26" fill="#8d6c40" />
          <polygon points="-4,-26 -4,-50 13,-42 13,-18" fill="#7b5637" opacity={0.9} />
        </g>
      );

    case "guitar":
      return (
        <g>
          <ellipse cx={0} cy={-16} rx={13} ry={16} fill="#b8702f" />
          <ellipse cx={0} cy={-10} rx={10} ry={11} fill="#c9843f" />
          <circle cx={0} cy={-16} r={4} fill="#2e2118" />
          <rect x={-3} y={-62} width={6} height={36} rx={2} fill="#6b4a32" />
          <rect x={-5} y={-68} width={10} height={8} rx={2} fill="#4a3324" />
        </g>
      );

    case "mirror":
      return (
        <g>
          <rect x={-13} y={-66} width={26} height={62} rx={12} fill="#8a6244" />
          <rect x={-10} y={-63} width={20} height={56} rx={10} fill="#cfe0ea" />
          <polygon points="-10,-63 0,-63 -10,-30" fill="#ffffff" opacity={0.5} />
        </g>
      );

    case "poster":
      return (
        <g>
          <polygon points="-16,0 16,-6 16,-48 -16,-42" fill="#efe6d2" />
          <polygon points="-12,-6 12,-11 12,-28 -12,-23" fill="#e0734f" />
          <polygon points="-12,-19 12,-24 12,-28 -12,-23" fill="#f0a84e" />
          <circle cx={-4} cy={-33} r={4} fill="#f5d04e" />
        </g>
      );

    case "fan":
      return (
        <g>
          <ellipse cx={0} cy={-2} rx={13} ry={6} fill="#4a4f58" />
          <rect x={-2.5} y={-44} width={5} height={42} fill="#6b7078" />
          {/* La jaula: un círculo con radios. A esta escala es lo que dice
              "ventilador" y no "lámpara". */}
          <circle cx={0} cy={-58} r={17} fill="#8d939c" />
          <circle cx={0} cy={-58} r={14} fill="#c3c8cf" />
          {[0, 45, 90, 135].map((deg) => (
            <line
              key={deg}
              x1={-14 * Math.cos((deg * Math.PI) / 180)}
              y1={-58 - 14 * Math.sin((deg * Math.PI) / 180)}
              x2={14 * Math.cos((deg * Math.PI) / 180)}
              y2={-58 + 14 * Math.sin((deg * Math.PI) / 180)}
              stroke="#8d939c"
              strokeWidth={1.5}
            />
          ))}
          <circle cx={0} cy={-58} r={4} fill="#5a5f68" />
        </g>
      );

    case "figure":
      return (
        <g>
          <ellipse cx={0} cy={-1} rx={9} ry={4} fill="#3b3f47" />
          <rect x={-8} y={-5} width={16} height={5} rx={1.5} fill="#4a4f58" />
          {/* Una silueta chiquita: cuerpo, pelo y una mancha de color. */}
          <path d="M -5 -5 q 0 -9 5 -9 q 5 0 5 9 z" fill="#5a8fd8" />
          <circle cx={0} cy={-18} r={5.5} fill="#f0cba8" />
          <path d="M -6 -19 q 2 -7 6 -7 q 4 0 6 7 q -3 -3 -6 -3 q -3 0 -6 3 z" fill="#c1543f" />
          <rect x={-1} y={-9} width={2} height={5} fill="#f0cba8" />
        </g>
      );

    case "rug": {
      // Va plana sobre el piso: es la única que no se levanta.
      const a = toScreen(0, 0);
      void a;
      return (
        <g>
          <polygon points={`0,-${TILE_H} ${TILE_W},0 0,${TILE_H} -${TILE_W},0`} fill="#9a4f5e" opacity={0.95} />
          <polygon
            points={`0,-${TILE_H - 10} ${TILE_W - 20},0 0,${TILE_H - 10} -${TILE_W - 20},0`}
            fill="#c2697a"
          />
          <polygon
            points={`0,-${TILE_H - 22} ${TILE_W - 44},0 0,${TILE_H - 22} -${TILE_W - 44},0`}
            fill="#e0a86a"
          />
        </g>
      );
    }

    default:
      return <rect x={-8} y={-16} width={16} height={16} rx={2} fill="#8e94a3" />;
  }
}

/* -------------------------------------------------------------------------- */
/* Lo que cuelga de la pared                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Una cosa colgada, dibujada SOBRE el plano de la pared.
 *
 * Todo sale de `wallPoint(t, u)`: `t` recorre la pared a lo ancho y `u` a lo
 * alto. Eso es lo que hace que una ventana salga inclinada igual que la
 * pared que la sostiene en vez de flotando de frente — que es exactamente la
 * diferencia entre un cuarto y un collage.
 *
 * La pared izquierda y la derecha tienen inclinaciones opuestas, así que
 * ninguna forma se puede dibujar con rectángulos: todas son polígonos de
 * cuatro puntos calculados sobre el plano.
 */
export function WallSprite({
  kind,
  x,
  y,
  side,
  seed,
}: {
  kind: string;
  x: number;
  y: number;
  side: WallSide;
  seed: number;
}) {
  /** Un cuadrilátero sobre la pared, entre dos anchos y dos alturas. */
  const quad = (t0: number, t1: number, u0: number, u1: number) => {
    const a = wallPoint(x, y, side, t0, u0);
    const b = wallPoint(x, y, side, t1, u0);
    const c = wallPoint(x, y, side, t1, u1);
    const d = wallPoint(x, y, side, t0, u1);

    return `${a.sx},${a.sy} ${b.sx},${b.sy} ${c.sx},${c.sy} ${d.sx},${d.sy}`;
  };

  const dot = (t: number, u: number) => wallPoint(x, y, side, t, u);

  // La pared izquierda recibe más luz que la derecha, y lo que cuelga tiene
  // que seguir esa misma regla o se despega del fondo.
  const key = side === "left" ? 1 : 0.84;

  switch (kind) {
    case "window": {
      const glass = side === "left" ? "#bfe4f5" : "#a4cfe4";

      return (
        <g>
          <polygon points={quad(0.12, 0.88, 0.3, 0.82)} fill="#6b5a46" />
          <polygon points={quad(0.17, 0.83, 0.34, 0.78)} fill={glass} />
          {/* El cielo que se ve por el vidrio: más claro arriba. */}
          <polygon points={quad(0.17, 0.83, 0.58, 0.78)} fill={lift(glass, 0.3)} />
          {/* Los parteluces. Sin la cruz, el vidrio se ve como un agujero. */}
          <polygon points={quad(0.49, 0.51, 0.34, 0.78)} fill="#6b5a46" />
          <polygon points={quad(0.17, 0.83, 0.55, 0.57)} fill="#6b5a46" />
          {/* El alféizar. */}
          <polygon points={quad(0.08, 0.92, 0.27, 0.31)} fill={dim("#8a7050", key)} />
        </g>
      );
    }

    case "door":
      return (
        <g>
          <polygon points={quad(0.14, 0.86, 0, 0.92)} fill="#6b5a46" />
          <polygon points={quad(0.19, 0.81, 0, 0.87)} fill={dim("#a8824f", key)} />
          {/* Los dos entrepaños que hacen que se lea como puerta. */}
          <polygon points={quad(0.26, 0.74, 0.1, 0.42)} fill={dim("#946f42", key)} />
          <polygon points={quad(0.26, 0.74, 0.5, 0.8)} fill={dim("#946f42", key)} />
          <circle cx={dot(0.73, 0.44).sx} cy={dot(0.73, 0.44).sy} r={3} fill="#e8c86a" />
        </g>
      );

    case "poster": {
      const tones = ["#e0734f", "#4f87e0", "#55a86a", "#c9679b"];
      const tone = tones[Math.floor(noise(x, y, seed) * tones.length) % tones.length];

      return (
        <g>
          <polygon points={quad(0.2, 0.8, 0.42, 0.84)} fill="#efe6d2" />
          <polygon points={quad(0.25, 0.75, 0.46, 0.7)} fill={dim(tone, key)} />
          <polygon points={quad(0.25, 0.75, 0.7, 0.8)} fill={dim(lift(tone, 0.3), key)} />
        </g>
      );
    }

    case "mirror":
      return (
        <g>
          <polygon points={quad(0.28, 0.72, 0.38, 0.86)} fill="#8a6244" />
          <polygon points={quad(0.32, 0.68, 0.41, 0.83)} fill={dim("#cfe0ea", key)} />
          {/* El reflejo: una diagonal más clara, que es lo que dice "vidrio". */}
          <polygon points={quad(0.32, 0.5, 0.41, 0.83)} fill="#ffffff" opacity={0.35} />
        </g>
      );

    case "clock":
      return (
        <g>
          <polygon points={quad(0.38, 0.62, 0.6, 0.78)} fill="#5c5042" />
          <polygon points={quad(0.41, 0.59, 0.62, 0.76)} fill={dim("#f4ead4", key)} />
          <polygon points={quad(0.49, 0.51, 0.65, 0.73)} fill="#3b3228" />
          <polygon points={quad(0.5, 0.57, 0.68, 0.7)} fill="#3b3228" />
        </g>
      );

    case "board":
      return (
        <g>
          {/* La repisa: una tabla y dos escuadras. */}
          <polygon points={quad(0.12, 0.88, 0.5, 0.56)} fill={dim("#b08b5c", key)} />
          <polygon points={quad(0.12, 0.88, 0.47, 0.5)} fill={dim("#8d6c40", key)} />
          <polygon points={quad(0.2, 0.26, 0.38, 0.5)} fill="#6b5a46" />
          <polygon points={quad(0.74, 0.8, 0.38, 0.5)} fill="#6b5a46" />
          {/* Tres libros encima, que es para lo que existe una repisa. */}
          <polygon points={quad(0.26, 0.33, 0.56, 0.76)} fill="#c1543f" />
          <polygon points={quad(0.35, 0.41, 0.56, 0.72)} fill="#3f7bc1" />
          <polygon points={quad(0.43, 0.5, 0.56, 0.8)} fill="#c9a227" />
        </g>
      );

    default:
      return <polygon points={quad(0.3, 0.7, 0.4, 0.7)} fill="#8e94a3" />;
  }
}

/**
 * Las zonas que se pueden tocar para colgar algo.
 *
 * Existen solo mientras hay una herramienta de pared elegida: son la pared
 * entera vuelta botón. Sin ellas habría que acertarle a una ventana que
 * todavía no está dibujada.
 */
export function WallTargets({
  plan,
  onPick,
}: {
  plan: string;
  onPick: (x: number, y: number, side: WallSide) => void;
}) {
  return (
    <g>
      {wallsOf(plan).map(({ x, y, side }) => {
        const a = wallPoint(x, y, side, 0, 0);
        const b = wallPoint(x, y, side, 1, 0);
        const c = wallPoint(x, y, side, 1, 1);
        const d = wallPoint(x, y, side, 0, 1);

        return (
          <polygon
            key={`${x}-${y}-${side}`}
            points={`${a.sx},${a.sy} ${b.sx},${b.sy} ${c.sx},${c.sy} ${d.sx},${d.sy}`}
            fill="#ffffff"
            fillOpacity={0.08}
            stroke="#ffffff"
            strokeOpacity={0.3}
            strokeDasharray="5 5"
            onPointerDown={(event) => {
              event.stopPropagation();
              onPick(x, y, side);
            }}
            style={{ cursor: "pointer" }}
          />
        );
      })}
    </g>
  );
}

/** La luz que tiran las cosas que brillan, pintada sobre el piso. */
export function PropGlow({ kind, x, y }: { kind: string; x: number; y: number }) {
  const skin = propSkin(kind);
  if (!skin.glow) return null;

  const { sx, sy } = toScreen(x, y);

  return (
    <ellipse
      cx={sx}
      cy={sy + HALF_H}
      rx={TILE_W * 0.9}
      ry={TILE_H * 0.9}
      fill={skin.glow}
      opacity={0.18}
      className="r-glow"
      pointerEvents="none"
    />
  );
}
