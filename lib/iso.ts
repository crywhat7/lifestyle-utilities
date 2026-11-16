/**
 * La proyección isométrica del cuarto.
 *
 * Todo lo que dibuja la vista sale de acá, y acá no hay ni una librería.
 * La decisión está razonada en el plan: lo que hace falta es una caja con
 * muebles que se puedan tocar, no 3D —no hay cámara libre, ni luces, ni
 * física—. Un motor WebGL costaría medio mega de bundle en una app
 * mobile-first, obligaría a implementar el raycasting para saber qué mueble
 * se tocó, y dejaría los muebles fuera del árbol de accesibilidad.
 *
 * Con SVG, tocar un mueble es un `onClick` del navegador, teñir una pared es
 * una variable CSS, y el peso es cero. Si algún día hace falta cámara
 * orbital de verdad, se cambia el renderizador sin tocar los datos: la
 * posición ya vive en la grilla de Postgres.
 *
 * La proyección es la 2:1 clásica —un rombo el doble de ancho que de alto—,
 * que es la de los juegos isométricos de toda la vida justamente porque cae
 * en píxeles enteros y no se ve borrosa.
 */

/** El piso del cuarto, en celdas. Ocho por ocho entra en una pantalla angosta. */
export const COLS = 8;
export const ROWS = 8;

/** Media celda. El alto es la mitad del ancho: eso ES la proyección 2:1. */
export const TILE_W = 64;
export const TILE_H = 32;

/** Cuánto suben las paredes del fondo. */
export const WALL_H = 150;

/* El rombo del piso completo mide (COLS+ROWS) medios anchos de lado a lado.
   El lienzo se calcula, no se escribe a mano: cambiar COLS no puede obligar
   a recordar que había un 540 en otro archivo. */
export const VIEW_W = (COLS + ROWS) * (TILE_W / 2);
export const VIEW_H = (COLS + ROWS) * (TILE_H / 2) + WALL_H;

/** El origen: la esquina de atrás, ya bajada lo que miden las paredes. */
const ORIGIN_X = ROWS * (TILE_W / 2);
const ORIGIN_Y = WALL_H;

/** De la celda (x, y) al píxel donde cae su esquina de atrás. */
export function toScreen(x: number, y: number) {
  return {
    sx: ORIGIN_X + (x - y) * (TILE_W / 2),
    sy: ORIGIN_Y + (x + y) * (TILE_H / 2),
  };
}

/**
 * Del píxel a la celda — la inversa, que es la que hace posible arrastrar.
 *
 * Sin esto, mover un mueble con el dedo sería adivinar: el gesto ocurre en
 * píxeles de pantalla y la posición se guarda en celdas.
 */
export function toGrid(sx: number, sy: number) {
  const dx = sx - ORIGIN_X;
  const dy = sy - ORIGIN_Y;

  return {
    x: (dy / (TILE_H / 2) + dx / (TILE_W / 2)) / 2,
    y: (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2,
  };
}

/** El rombo de una celda, listo para un `points` de polígono. */
export function tilePoints(x: number, y: number) {
  const { sx, sy } = toScreen(x, y);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;

  return `${sx},${sy} ${sx + hw},${sy + hh} ${sx},${sy + TILE_H} ${sx - hw},${sy + hh}`;
}

/* -------------------------------------------------------------------------- */
/* Los muebles                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cuánto ocupa y cuánto levanta cada tipo de mueble.
 *
 * `w` y `h` son celdas de piso; `lift` es la altura en píxeles. Los números
 * no son caprichosos: un armario tiene que verse más alto que una cama o la
 * vista deja de leerse como un cuarto. Esto es lo único que separa un mueble
 * de otro en el dibujo, y alcanza — a esta escala, lo que distingue a un
 * escritorio de una cómoda es la silueta, no el detalle.
 */
export const SHAPES: Record<string, { w: number; h: number; lift: number }> = {
  wardrobe: { w: 2, h: 1, lift: 132 },
  cabinet: { w: 2, h: 1, lift: 96 },
  shelf: { w: 2, h: 1, lift: 116 },
  dresser: { w: 2, h: 1, lift: 72 },
  desk: { w: 2, h: 1, lift: 56 },
  table: { w: 2, h: 2, lift: 50 },
  bed: { w: 2, h: 3, lift: 36 },
  nightstand: { w: 1, h: 1, lift: 44 },
  trunk: { w: 2, h: 1, lift: 34 },
  other: { w: 1, h: 1, lift: 60 },
};

export function shapeOf(variant: string | null) {
  return SHAPES[variant ?? "other"] ?? SHAPES.other;
}

/** La huella de un mueble ya girado: a 90° y 270° se intercambian los lados. */
export function footprint(
  variant: string | null,
  rotation: number,
  stored: { w: number | null; h: number | null }
) {
  const base = shapeOf(variant);
  const w = stored.w ?? base.w;
  const h = stored.h ?? base.h;
  const turned = rotation === 90 || rotation === 270;

  return { w: turned ? h : w, h: turned ? w : h, lift: base.lift };
}

/** Que la huella entre entera en el piso, la empuje quien la empuje. */
export function clampToFloor(x: number, y: number, w: number, h: number) {
  return {
    x: Math.max(0, Math.min(COLS - w, Math.round(x))),
    y: Math.max(0, Math.min(ROWS - h, Math.round(y))),
  };
}

/** ¿Se pisan dos muebles? Dos rectángulos en la grilla, nada más. */
export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * El primer hueco libre, recorriendo el piso de atrás hacia adelante.
 *
 * Es lo que hace que colocar un mueble sea un toque y no un arrastre: la
 * pieza aparece en un lugar válido y desde ahí se la mueve si molesta.
 * Buscar desde el fondo es a propósito — lo nuevo entra contra la pared, que
 * es donde uno pone un mueble.
 */
export function firstFreeCell(
  w: number,
  h: number,
  taken: { x: number; y: number; w: number; h: number }[]
) {
  for (let y = 0; y <= ROWS - h; y += 1) {
    for (let x = 0; x <= COLS - w; x += 1) {
      const spot = { x, y, w, h };
      if (!taken.some((other) => overlaps(spot, other))) return spot;
    }
  }

  return null;
}

/**
 * El orden en que se dibuja: lo de atrás primero.
 *
 * En isométrico no hay buffer de profundidad; lo que tapa a qué lo decide el
 * orden de los elementos en el SVG. La suma x+y es la distancia a la esquina
 * de atrás, así que ordenar por ella es exactamente el orden del pintor.
 */
export function depthOrder<T extends { x: number; y: number; w: number; h: number }>(
  pieces: T[]
) {
  return [...pieces].sort((a, b) => a.x + a.y - (b.x + b.y));
}

/* -------------------------------------------------------------------------- */
/* Los colores del cuarto                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Las paletas de pared y piso.
 *
 * Pocas y elegidas: una rueda de color deja pintar una pared de fucsia puro
 * y el cuarto deja de leerse. Son tonos de pintura y de madera, que es lo que
 * hay en un cuarto real.
 */
export const WALL_COLORS = [
  "#e8e3d9",
  "#dde5ea",
  "#e4e3ef",
  "#e9e2e2",
  "#dfe8e0",
  "#efe7d8",
  "#d8dde4",
  "#cfd4d8",
] as const;

export const FLOOR_COLORS = [
  "#c9a479",
  "#b5835a",
  "#8f6a4a",
  "#d9cbb6",
  "#b9bec4",
  "#9aa7a0",
  "#cfc3ae",
  "#7d6552",
] as const;

export const DEFAULT_WALL = WALL_COLORS[0];
export const DEFAULT_FLOOR = FLOOR_COLORS[0];
