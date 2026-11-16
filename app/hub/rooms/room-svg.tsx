import {
  COLS,
  ROWS,
  TILE_H,
  TILE_W,
  VIEW_H,
  VIEW_W,
  WALL_H,
  toScreen,
  tilePoints,
} from "@/lib/iso";

/**
 * El cuarto dibujado: piso, dos paredes y los muebles encima.
 *
 * Todo son polígonos calculados, cero imágenes. Eso es lo que permite que la
 * pared y el piso se pinten con el color que elija la persona sin re-exportar
 * nada, y que un mueble pese lo que pesan cuatro líneas de SVG.
 *
 * El sombreado es una sola regla aplicada en todas partes: la cara de arriba
 * recibe la luz entera, la izquierda algo menos y la derecha es la sombra.
 * Sin esa diferencia constante, un cubo isométrico se ve como un hexágono
 * plano y el cuarto pierde el volumen de golpe.
 */

/**
 * Las tres caras de un mismo color.
 *
 * La mezcla va en sRGB y no en OKLCH, y esto no es un detalle: el negro es
 * acromático, así que al interpolarlo en un espacio polar su matiz es
 * "powerless" y el resultado sale con `hue: none`. En la práctica eso
 * significa que toda pared —verde, azul o lila— terminaba del mismo gris
 * rosado, y la paleta entera no servía para nada. En sRGB oscurecer es
 * multiplicar los tres canales, así que la relación entre ellos —el tono— se
 * conserva intacta.
 */
export function shade(color: string) {
  return {
    top: color,
    left: `color-mix(in srgb, ${color} 82%, #000000)`,
    right: `color-mix(in srgb, ${color} 66%, #000000)`,
  };
}

/* -------------------------------------------------------------------------- */

/** El piso: un rombo por celda, con la retícula marcada apenas. */
export function Floor({ color, grid }: { color: string; grid: boolean }) {
  const cells = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      cells.push(
        <polygon
          key={`${x}-${y}`}
          points={tilePoints(x, y)}
          fill={color}
          /* La retícula solo aparece colocando muebles: fuera de ese momento
             es ruido, y durante ese momento es la única pista de dónde va a
             caer la pieza. */
          stroke={grid ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.05)"}
          strokeWidth={grid ? 1 : 0.5}
        />
      );
    }
  }

  return <g>{cells}</g>;
}

/** Las dos paredes del fondo, la izquierda más iluminada que la derecha. */
export function Walls({ color }: { color: string }) {
  const faces = shade(color);

  const back = toScreen(0, 0);
  const left = toScreen(0, ROWS);
  const right = toScreen(COLS, 0);

  return (
    <g>
      {/* Pared de la izquierda: va de la esquina del fondo hacia abajo. */}
      <polygon
        points={`${back.sx},${back.sy} ${left.sx},${left.sy} ${left.sx},${left.sy - WALL_H} ${back.sx},${back.sy - WALL_H}`}
        fill={faces.left}
      />
      {/* Pared de la derecha. */}
      <polygon
        points={`${back.sx},${back.sy} ${right.sx},${right.sy} ${right.sx},${right.sy - WALL_H} ${back.sx},${back.sy - WALL_H}`}
        fill={faces.right}
      />
      {/* El canto donde se encuentran: sin esta línea las dos paredes se
          funden en una sola mancha y la esquina desaparece. */}
      <line
        x1={back.sx}
        y1={back.sy}
        x2={back.sx}
        y2={back.sy - WALL_H}
        stroke="rgba(0,0,0,0.12)"
        strokeWidth={1}
      />
    </g>
  );
}

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
 * Un mueble: una caja isométrica con una pista de qué es.
 *
 * Deliberadamente una sola primitiva para todos. Un armario y una cómoda se
 * distinguen por su silueta —alto y angosto contra bajo y ancho— y por dos o
 * tres líneas en la cara frontal, no por un modelo propio. Veinticinco
 * dibujos distintos serían veinticinco cosas que mantener para que, a esta
 * escala, se vean casi iguales.
 */
export function Furniture({
  piece,
  dim,
  selected,
}: {
  piece: Piece;
  dim?: boolean;
  selected?: boolean;
}) {
  const faces = shade(piece.color);
  const { lift } = piece;

  // Las cuatro esquinas de la huella, en el piso.
  const back = toScreen(piece.x, piece.y);
  const right = toScreen(piece.x + piece.w, piece.y);
  const front = toScreen(piece.x + piece.w, piece.y + piece.h);
  const left = toScreen(piece.x, piece.y + piece.h);

  const up = (p: { sx: number; sy: number }) => `${p.sx},${p.sy - lift}`;
  const flat = (p: { sx: number; sy: number }) => `${p.sx},${p.sy}`;

  return (
    <g opacity={dim ? 0.45 : 1}>
      {/* Cara izquierda (la que mira al frente-izquierda). */}
      <polygon
        points={`${flat(left)} ${flat(front)} ${up(front)} ${up(left)}`}
        fill={faces.left}
      />
      {/* Cara derecha. */}
      <polygon
        points={`${flat(front)} ${flat(right)} ${up(right)} ${up(front)}`}
        fill={faces.right}
      />
      {/* Tapa. */}
      <polygon
        points={`${up(back)} ${up(right)} ${up(front)} ${up(left)}`}
        fill={faces.top}
      />

      <Detail piece={piece} lift={lift} />

      {/* Lo que se está moviendo lleva un contorno: en una pantalla llena de
          cajas del mismo color, sin esto no se sabe cuál sigue el dedo. */}
      {selected ? (
        <polygon
          points={`${up(back)} ${up(right)} ${up(front)} ${up(left)}`}
          fill="none"
          stroke="var(--tone)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  );
}

/**
 * Las dos o tres líneas que dicen qué mueble es.
 *
 * Van sobre la cara izquierda, que es la que queda de frente al mirar: las
 * gavetas de una cómoda, las repisas de una estantería, la almohada de una
 * cama. Es el mínimo que convierte una caja en un objeto reconocible.
 */
function Detail({ piece, lift }: { piece: Piece; lift: number }) {
  const left = toScreen(piece.x, piece.y + piece.h);
  const front = toScreen(piece.x + piece.w, piece.y + piece.h);

  const ink = "rgba(0,0,0,0.22)";
  const lines: number[] = [];

  if (piece.variant === "dresser") lines.push(0.3, 0.6);
  else if (piece.variant === "shelf") lines.push(0.25, 0.5, 0.75);
  else if (piece.variant === "wardrobe" || piece.variant === "cabinet") lines.push(0.5);
  else if (piece.variant === "trunk") lines.push(0.45);

  return (
    <g>
      {lines.map((t) => {
        // Una línea horizontal a la altura `t` de la cara, siguiendo su
        // inclinación: va del canto izquierdo al frontal, los dos subidos.
        const y1 = left.sy - lift * (1 - t);
        const y2 = front.sy - lift * (1 - t);

        return (
          <line
            key={t}
            x1={left.sx}
            y1={y1}
            x2={front.sx}
            y2={y2}
            stroke={ink}
            strokeWidth={1.5}
          />
        );
      })}

      {/* La cama lleva almohada en vez de líneas: es lo que la hace cama. */}
      {piece.variant === "bed" ? <Pillow piece={piece} lift={lift} /> : null}
    </g>
  );
}

function Pillow({ piece, lift }: { piece: Piece; lift: number }) {
  // Media celda contra la cabecera, sobre la tapa.
  const a = toScreen(piece.x + 0.15, piece.y + 0.15);
  const b = toScreen(piece.x + piece.w - 0.15, piece.y + 0.15);
  const c = toScreen(piece.x + piece.w - 0.15, piece.y + 0.9);
  const d = toScreen(piece.x + 0.15, piece.y + 0.9);

  return (
    <polygon
      points={`${a.sx},${a.sy - lift} ${b.sx},${b.sy - lift} ${c.sx},${c.sy - lift} ${d.sx},${d.sy - lift}`}
      fill="rgba(255,255,255,0.55)"
    />
  );
}

/** El fantasma de dónde va a caer la pieza que se está arrastrando. */
export function Ghost({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const back = toScreen(x, y);
  const right = toScreen(x + w, y);
  const front = toScreen(x + w, y + h);
  const left = toScreen(x, y + h);

  return (
    <polygon
      points={`${back.sx},${back.sy} ${right.sx},${right.sy} ${front.sx},${front.sy} ${left.sx},${left.sy}`}
      fill="var(--tone)"
      fillOpacity={0.25}
      stroke="var(--tone)"
      strokeWidth={2}
      strokeDasharray="6 4"
    />
  );
}

export const CANVAS = { width: VIEW_W, height: VIEW_H, tile: { w: TILE_W, h: TILE_H } };
