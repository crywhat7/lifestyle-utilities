/**
 * El cuarto, visto desde la esquina.
 *
 * Todo lo que dibuja la vista sale de acá, y acá no hay ni una librería.
 * La decisión está razonada en el plan: lo que hace falta es un cuarto con
 * muebles que se puedan tocar, no 3D —no hay cámara libre, ni luces, ni
 * física—. Un motor WebGL costaría medio mega de bundle en una app
 * mobile-first, obligaría a implementar el raycasting para saber qué se tocó,
 * y dejaría todo fuera del árbol de accesibilidad.
 *
 * Con SVG, tocar un armario es un `onClick` del navegador, pintar una pared
 * es cambiar un color, y el peso es cero.
 *
 * La proyección es la 2:1 clásica —un rombo el doble de ancho que de alto—,
 * que es la de los juegos isométricos de toda la vida justamente porque cae
 * en píxeles enteros y no se ve borrosa.
 */

/** La planta del cuarto, en celdas. Ocho por ocho entra en una pantalla angosta. */
export const COLS = 8;
export const ROWS = 8;
export const CELLS = COLS * ROWS;

/** Media celda. El alto es la mitad del ancho: eso ES la proyección 2:1. */
export const TILE_W = 64;
export const TILE_H = 32;

/** Lo que miden las paredes. Alto de cuarto, no de galpón. */
export const WALL_H = 112;

/** El espesor del piso, que se ve por los cantos donde el cuarto termina. */
export const SLAB_H = 14;

/** Aire arriba para que una pared del fondo no quede cortada por el borde. */
const HEADROOM = WALL_H + 34;

export const VIEW_W = (COLS + ROWS) * (TILE_W / 2);
export const VIEW_H = (COLS + ROWS) * (TILE_H / 2) + SLAB_H + HEADROOM;

const ORIGIN_X = ROWS * (TILE_W / 2);
const ORIGIN_Y = HEADROOM;

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
/* El azar que no tiembla                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Un número estable entre 0 y 1 para cada celda.
 *
 * La madera necesita vetas repartidas de forma despareja, o se ve como un
 * mantel. Pero si esas vetas salieran de `Math.random()` cambiarían de lugar
 * en cada render —y en cada toque— y el piso temblaría. Esto da desorden que
 * se queda quieto: la misma celda siempre devuelve el mismo número.
 *
 * Y es aritmética ENTERA, no `Math.sin`, por una razón que costó un bug: las
 * funciones trigonométricas no están especificadas al último bit, así que
 * Node y el navegador devuelven valores que difieren en el décimo decimal.
 * El servidor dibujaba una veta en `x="344.236451330455"` y el cliente en
 * `344.236451330781`, y React cancelaba la hidratación de la página entera
 * por eso. Con enteros y desplazamientos de bits el resultado es idéntico en
 * cualquier máquina.
 */
export function noise(x: number, y: number, salt = 0) {
  let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263 + Math.round(salt) * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);

  return (h >>> 0) % 100000 / 100000;
}

/* -------------------------------------------------------------------------- */
/* El piso — y la forma del cuarto                                             */
/* -------------------------------------------------------------------------- */

/**
 * El alfabeto del piso.
 *
 * `.` no es un material: es FUERA DEL CUARTO. Esa sola letra es lo que
 * permite cuartos en L, en T, con el rincón mordido donde está la puerta o
 * con el hueco de la escalera. El piso dejó de ser un fondo y pasó a ser la
 * planta del lugar, y las paredes se calculan a partir de él.
 */
export type Floor = "." | "w" | "t" | "c" | "s";

export type FloorSkin = {
  key: Floor;
  label: string;
  /** La cara de arriba, iluminada. */
  top: string;
  /** Vetas, juntas y pelusa. */
  fleck: string;
  /** El brillo del canto que agarra la luz. */
  rim: string;
};

export const FLOORS: FloorSkin[] = [
  { key: "w", label: "Madera", top: "#b98b55", fleck: "#9c7142", rim: "#d8ab73" },
  { key: "t", label: "Baldosa", top: "#cdd3dc", fleck: "#aab2bf", rim: "#eef1f6" },
  { key: "c", label: "Alfombra", top: "#9a6f86", fleck: "#835b70", rim: "#b98da3" },
  { key: "s", label: "Cemento", top: "#9ba0a6", fleck: "#858a91", rim: "#bcc1c7" },
];

const FLOOR_MAP = new Map(FLOORS.map((skin) => [skin.key, skin]));

export function floorSkin(key: string): FloorSkin {
  return FLOOR_MAP.get(key as Floor) ?? FLOORS[0];
}

export function isFloor(value: unknown): value is Floor {
  return value === "." || FLOOR_MAP.has(value as Floor);
}

/** Un cuarto recién creado: madera de punta a punta. */
export function blankFloor(): string {
  return "w".repeat(CELLS);
}

/** El plano guardado, o el de siempre si todavía no se tocó nada. */
export function readFloor(stored: string | null) {
  return stored && stored.length === CELLS && /^[.wtcs]+$/.test(stored)
    ? stored
    : blankFloor();
}

export function floorAt(plan: string, x: number, y: number): Floor {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return ".";
  const at = plan[y * COLS + x];
  return isFloor(at) ? at : ".";
}

/** ¿Esta celda es parte del cuarto? */
export function inside(plan: string, x: number, y: number) {
  return floorAt(plan, x, y) !== ".";
}

/** Pintar una celda devuelve un plano nuevo; el viejo no se toca. */
export function paintCell(plan: string, x: number, y: number, key: Floor) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return plan;

  const at = y * COLS + x;
  return plan.slice(0, at) + key + plan.slice(at + 1);
}

/**
 * Dónde van las paredes.
 *
 * No se guardan en ningún lado: una pared existe donde una celda con piso
 * toca el vacío por detrás. Así, un cuarto en L tiene sus paredes en L sin
 * que nadie las dibuje, y recortar una esquina mueve la pared sola.
 * Guardarlas aparte sería guardar algo que el piso ya dice, y dejar que las
 * dos versiones se contradigan.
 *
 * Solo las dos caras de atrás: las de adelante taparían el cuarto.
 */
export type WallSide = "left" | "right";

export function wallsOf(plan: string) {
  const walls: { x: number; y: number; side: WallSide }[] = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!inside(plan, x, y)) continue;

      // La pared izquierda tapa lo que vendría por detrás en x.
      if (!inside(plan, x - 1, y)) walls.push({ x, y, side: "left" });
      // La derecha, lo que vendría por detrás en y.
      if (!inside(plan, x, y - 1)) walls.push({ x, y, side: "right" });
    }
  }

  return walls;
}

/** Los cantos del piso que quedan a la vista, donde el cuarto termina. */
export function edgesOf(plan: string) {
  const edges: { x: number; y: number; side: WallSide }[] = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!inside(plan, x, y)) continue;

      if (!inside(plan, x + 1, y)) edges.push({ x, y, side: "right" });
      if (!inside(plan, x, y + 1)) edges.push({ x, y, side: "left" });
    }
  }

  return edges;
}

/** Colores de pintura. Pocos y de pared de verdad, no de paleta de neón. */
export const WALL_COLORS = [
  "#e6dcc8",
  "#dfe3e8",
  "#d8e0d4",
  "#ebdcd8",
  "#dcd8e8",
  "#c9bfae",
  "#b9c6cf",
  "#8f8578",
] as const;

/** El tinte de la luz que entra por la ventana. El aire del cuarto. */
export const LIGHT_COLORS = [
  "#ffd9a0",
  "#a8d8ff",
  "#ffc2d6",
  "#c6f0d8",
  "#d9c6ff",
  "#fff0b8",
  "#b8c6d8",
  "#ffb8a0",
] as const;

export const DEFAULT_WALL = WALL_COLORS[0];
export const DEFAULT_LIGHT = LIGHT_COLORS[0];

/** Que un color guardado antes de esta paleta no deje el cuarto raro. */
export function safeWall(value: string | null) {
  return value && (WALL_COLORS as readonly string[]).includes(value) ? value : DEFAULT_WALL;
}

export function safeLight(value: string | null) {
  return value && (LIGHT_COLORS as readonly string[]).includes(value) ? value : DEFAULT_LIGHT;
}

/* -------------------------------------------------------------------------- */
/* Los muebles                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cuánto ocupa y cuánto levanta cada tipo de mueble.
 *
 * `w` y `h` son celdas de piso; `lift` es la altura en píxeles. Los números
 * no son caprichosos: un armario tiene que verse más alto que una cama o la
 * vista deja de leerse como un cuarto. `top` dice si se pueden apoyar cosas
 * encima — un escritorio sí, una cama no.
 */
export const SHAPES: Record<string, { w: number; h: number; lift: number; top?: boolean }> = {
  wardrobe: { w: 2, h: 1, lift: 104 },
  cabinet: { w: 2, h: 1, lift: 76, top: true },
  shelf: { w: 2, h: 1, lift: 96, top: true },
  dresser: { w: 2, h: 1, lift: 58, top: true },
  desk: { w: 2, h: 1, lift: 44, top: true },
  table: { w: 2, h: 2, lift: 40, top: true },
  bed: { w: 2, h: 3, lift: 28 },
  nightstand: { w: 1, h: 1, lift: 36, top: true },
  trunk: { w: 2, h: 1, lift: 26, top: true },
  other: { w: 1, h: 1, lift: 48, top: true },
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

  return { w: turned ? h : w, h: turned ? w : h, lift: base.lift, top: base.top ?? false };
}

/** El siguiente cuarto de vuelta. */
export function turn(rotation: number) {
  return ((rotation || 0) + 90) % 360;
}

/**
 * De qué madera está hecho cada mueble.
 *
 * Todos del mismo marrón, un cuarto con cuatro muebles se ve como cuatro
 * cajas iguales. Son maderas de verdad —roble claro, nogal, pino— y con eso
 * la silueta deja de ser lo único que los distingue.
 */
export const WOODS: Record<string, string> = {
  wardrobe: "#9a7046",
  cabinet: "#86623e",
  shelf: "#b08b5c",
  dresser: "#a37249",
  desk: "#b8916a",
  table: "#c09a6c",
  bed: "#8d7aa8",
  nightstand: "#a87f55",
  trunk: "#7b5637",
  other: "#9a7046",
};

export function woodOf(variant: string | null) {
  return WOODS[variant ?? "other"] ?? WOODS.other;
}

/* -------------------------------------------------------------------------- */
/* Las cosas del cuarto                                                        */
/* -------------------------------------------------------------------------- */

export type PropKind =
  | "monitor"
  | "pc"
  | "keyboard"
  | "headphones"
  | "box"
  | "books"
  | "plant"
  | "lamp"
  | "chair"
  | "rug"
  | "mirror"
  | "guitar"
  | "basket"
  | "poster";

export type PropSkin = {
  key: PropKind;
  label: string;
  lift: number;
  w: number;
  h: number;
  /** Dónde puede ir: en el suelo, sobre un mueble, o en los dos lados. */
  surface: "floor" | "top" | "both";
  /** Las que iluminan tiñen el piso alrededor. */
  glow?: string;
};

/**
 * El catálogo de cosas que no guardan nada.
 *
 * Son las que hacen que un plano se parezca a TU cuarto y no a una grilla
 * con cajas: el monitor sobre el escritorio, los auriculares al lado, la
 * caja que siempre está en el piso, la planta del rincón.
 *
 * `surface` es la regla que hace que esto se sienta como un juego y no como
 * un formulario: un monitor solo se apoya sobre algo, una alfombra solo va
 * en el suelo, y una caja va donde sea — que es exactamente lo que pasa con
 * las cajas.
 */
export const PROPS: PropSkin[] = [
  { key: "monitor", label: "Monitor", lift: 42, w: 1, h: 1, surface: "top" },
  { key: "keyboard", label: "Teclado", lift: 6, w: 1, h: 1, surface: "top" },
  { key: "headphones", label: "Auriculares", lift: 16, w: 1, h: 1, surface: "both" },
  { key: "pc", label: "Torre", lift: 46, w: 1, h: 1, surface: "floor" },
  { key: "books", label: "Libros", lift: 22, w: 1, h: 1, surface: "both" },
  { key: "box", label: "Caja", lift: 26, w: 1, h: 1, surface: "both" },
  { key: "basket", label: "Canasta", lift: 24, w: 1, h: 1, surface: "both" },
  { key: "plant", label: "Planta", lift: 58, w: 1, h: 1, surface: "both" },
  { key: "lamp", label: "Lámpara", lift: 84, w: 1, h: 1, surface: "floor", glow: "#ffd9a0" },
  { key: "chair", label: "Silla", lift: 46, w: 1, h: 1, surface: "floor" },
  { key: "guitar", label: "Guitarra", lift: 66, w: 1, h: 1, surface: "floor" },
  { key: "mirror", label: "Espejo", lift: 72, w: 1, h: 1, surface: "floor" },
  { key: "poster", label: "Póster", lift: 54, w: 1, h: 1, surface: "floor" },
  { key: "rug", label: "Alfombra", lift: 0, w: 2, h: 2, surface: "floor" },
];

const PROP_MAP = new Map(PROPS.map((skin) => [skin.key, skin]));

export function propSkin(key: string): PropSkin {
  return PROP_MAP.get(key as PropKind) ?? PROPS[0];
}

export function isPropKind(value: unknown): value is PropKind {
  return typeof value === "string" && PROP_MAP.has(value as PropKind);
}

/** Una cosa puesta en el plano. */
export type Prop = {
  id: string;
  variant: string;
  grid_x: number;
  grid_y: number;
  rotation: number;
  seed: number;
};

/* -------------------------------------------------------------------------- */
/* Reglas del piso                                                             */
/* -------------------------------------------------------------------------- */

/** Que la huella entre entera en la grilla, la empuje quien la empuje. */
export function clampToFloor(x: number, y: number, w: number, h: number) {
  return {
    x: Math.max(0, Math.min(COLS - w, Math.round(x))),
    y: Math.max(0, Math.min(ROWS - h, Math.round(y))),
  };
}

/** ¿Toda la huella cae dentro del cuarto? Un armario no flota sobre el vacío. */
export function fits(plan: string, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      if (!inside(plan, x + dx, y + dy)) return false;
    }
  }

  return true;
}

/** ¿Se pisan dos cosas? Dos rectángulos en la grilla, nada más. */
export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * El primer hueco libre, recorriendo el cuarto de atrás hacia adelante.
 *
 * Es lo que hace que colocar un mueble sea un toque y no un arrastre: la
 * pieza aparece en un lugar válido y desde ahí se la mueve si molesta.
 * Buscar desde el fondo es a propósito — lo nuevo entra contra la pared, que
 * es donde uno pone un mueble.
 */
export function firstFreeCell(
  plan: string,
  w: number,
  h: number,
  taken: { x: number; y: number; w: number; h: number }[]
) {
  for (let y = 0; y <= ROWS - h; y += 1) {
    for (let x = 0; x <= COLS - w; x += 1) {
      const spot = { x, y, w, h };
      if (!fits(plan, x, y, w, h)) continue;
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
 *
 * El desempate importa: una cosa APOYADA sobre un mueble comparte celda con
 * él, y si se dibujara antes el monitor quedaría detrás del escritorio.
 */
export function depthOrder<
  T extends { x: number; y: number; w: number; h: number; above?: boolean },
>(pieces: T[]) {
  return [...pieces].sort((a, b) => {
    const depth = a.x + a.y + a.w + a.h - (b.x + b.y + b.w + b.h);
    if (depth !== 0) return depth;

    return Number(a.above ?? false) - Number(b.above ?? false);
  });
}
