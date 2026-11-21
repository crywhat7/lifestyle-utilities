/**
 * Rooms Planning — el vocabulario del inventario.
 *
 * Todo lo que no necesita la base de datos ni el navegador en exclusiva vive
 * acá: los cuatro tipos de contenedor, qué puede ir dentro de qué, los
 * catálogos que llenan los selectores y las cuentas de la ruta. Sin
 * `server-only` a propósito — el formulario del cliente y el loader del
 * servidor tienen que estar de acuerdo sobre qué es una gaveta, y la única
 * forma de garantizarlo es que lean la misma lista.
 *
 * La regla de jerarquía está escrita dos veces: acá y en el trigger de la
 * migración 0018. No es duplicación por descuido — acá sirve para no ofrecer
 * un botón imposible, y allá para que no entre basura por la consola de
 * Supabase. La de la base es la que manda.
 */

/* -------------------------------------------------------------------------- */
/* Los tipos                                                                   */
/* -------------------------------------------------------------------------- */

export type NodeKind = "room" | "furniture" | "compartment" | "container";

export type Condition = "new" | "good" | "used" | "worn" | "broken";

/** Un nodo tal como sale de `rooms_nodes`, con las columnas que la UI pide. */
export type RoomNode = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  name: string;
  variant: string | null;
  note: string | null;
  quantity: number;
  color: string | null;
  wall_color: string | null;
  floor_color: string | null;
  /* Dónde está puesto el mueble en la grilla del cuarto. Nulo mientras nadie
     lo haya colocado en la vista isométrica: el inventario funciona entero
     sin esto, y la vista solo dibuja lo que ya tiene lugar. */
  grid_x: number | null;
  grid_y: number | null;
  grid_w: number | null;
  grid_h: number | null;
  rotation: number;
  /* El piso pintado de una habitación: una letra por celda. Nulo mientras
     nadie lo haya tocado, y entonces la vista dibuja pasto parejo. */
  terrain: string | null;
  /* La foto del contenedor. No se dibuja en el plano —el plano es un dibujo—:
     existe para la ruta de búsqueda, que es donde vale oro. La miniatura
     viaja en la fila y por eso la ruta se pinta sin pedir nada a la red. */
  storage_path: string | null;
  thumb: string | null;
  /** El enlace firmado, que agrega el loader. */
  photo?: string | null;
  sort_order: number;
  path: string[];
  path_ids: string[];
  depth: number;
  created_at: string;
};

/** Una cosa. */
export type Item = {
  id: string;
  node_id: string;
  name: string;
  category: string;
  condition: Condition;
  note: string | null;
  quantity: number;
  /* La miniatura viaja dentro de la fila y pinta la lista sin pedir nada a la
     red. Las otras dos son rutas del bucket privado: no se pueden mostrar sin
     firmar, y por eso el loader agrega `photo` y `cutout` ya firmadas. */
  thumb: string | null;
  storage_path: string | null;
  cutout_path: string | null;
  created_at: string;
};

/** Un ítem con sus enlaces firmados, que es como llega a la pantalla. */
export type ItemWithPhoto = Item & {
  photo: string | null;
  cutout: string | null;
};

/**
 * La versión liviana de una cosa: dónde está, cómo se llama y cuántas son.
 *
 * Es lo que la portada necesita para contar y para buscar. Sin notas ni
 * imágenes, el inventario entero entra en una consulta que no crece con el
 * peso de las fotos.
 */
export type IndexEntry = {
  id: string;
  node_id: string;
  name: string;
  category: string;
  condition: Condition;
  quantity: number;
};

/** Una prenda recortada, lista para combinar. */
export type Garment = {
  id: string;
  node_id: string;
  name: string;
  category: string;
  cutout: string | null;
};

/**
 * Las ranuras del maniquí.
 *
 * Un conjunto no es un collage: es un cuerpo con capas, y las capas tienen un
 * orden que no se negocia —la camisa va debajo del abrigo, las calcetas
 * debajo de los zapatos—. Nombrar la ranura en vez de guardar coordenadas es
 * lo que deja elegir ropa con un selector en vez de arrastrar recortes hasta
 * que queden derechos.
 *
 * Seis y no más: cada ranura agrega una fila de selector a la pantalla, y una
 * pantalla con doce filas ya no se recorre de un pulgar.
 */
export type Slot = "accessory" | "outer" | "top" | "bottom" | "socks" | "shoes";

/**
 * Cada ranura, con su lugar en el cuerpo.
 *
 * `top`/`height` son porcentajes del maniquí y `z` el orden de las capas. Las
 * zonas se superponen a propósito —el abrigo pisa la camisa, el zapato pisa
 * la calceta— porque así se superpone la ropa de verdad.
 *
 * El orden de la lista es el orden de arriba hacia abajo en pantalla, que es
 * también el orden en que uno se viste de la cabeza a los pies.
 */
export const SLOTS: {
  key: Slot;
  label: string;
  /** Lo que se le pide al selector cuando está vacío. */
  empty: string;
  top: number;
  height: number;
  width: number;
  z: number;
}[] = [
  { key: "accessory", label: "Accesorio", empty: "Sin accesorio", top: 1, height: 15, width: 44, z: 5 },
  { key: "top", label: "Arriba", empty: "Sin camisa", top: 17, height: 32, width: 78, z: 2 },
  { key: "outer", label: "Abrigo", empty: "Sin abrigo", top: 15, height: 38, width: 92, z: 3 },
  { key: "bottom", label: "Abajo", empty: "Sin pantalón", top: 46, height: 36, width: 66, z: 1 },
  { key: "socks", label: "Calcetas", empty: "Sin calcetas", top: 78, height: 12, width: 46, z: 1 },
  { key: "shoes", label: "Zapatos", empty: "Sin zapatos", top: 85, height: 14, width: 60, z: 4 },
];

const SLOT_MAP = new Map(SLOTS.map((slot) => [slot.key, slot]));

export function slotOf(key: unknown) {
  return typeof key === "string" ? SLOT_MAP.get(key as Slot) ?? null : null;
}

export function isSlot(value: unknown): value is Slot {
  return typeof value === "string" && SLOT_MAP.has(value as Slot);
}

/**
 * Qué ranura le toca a una prenda cuando entra al maniquí.
 *
 * Es una propuesta, no una regla: la categoría del inventario sabe si algo es
 * calzado pero no sabe si una prenda de "ropa" es una camisa o un pantalón.
 * Acierta en zapatos y accesorios —que son categoría propia— y en el resto
 * deja la decisión en el selector, que es donde se ve el resultado.
 */
export function suggestedSlot(category: string): Slot {
  if (category === "shoes") return "shoes";
  if (category === "accessories") return "accessory";
  return "top";
}

/** Dónde quedó puesta una prenda del conjunto. */
export type Piece = {
  item_id: string;
  /* La ranura del cuerpo. Falta en los conjuntos armados antes del maniquí,
     que se siguen dibujando por coordenadas: ver `OutfitFigure`. */
  slot?: Slot;
  /* Porcentajes del lienzo, no píxeles: el conjunto se ve igual en un
     teléfono angosto que en una pantalla ancha. */
  x: number;
  y: number;
  scale: number;
  rot: number;
};

/** Un conjunto guardado. */
export type Outfit = {
  id: string;
  name: string;
  note: string | null;
  pieces: Piece[];
  created_at: string;
};

export const NODE_COLUMNS =
  "id,parent_id,kind,name,variant,note,quantity,color,wall_color,floor_color,grid_x,grid_y,grid_w,grid_h,rotation,terrain,storage_path,thumb,sort_order,path,path_ids,depth,created_at";

export const ITEM_COLUMNS =
  "id,node_id,name,category,condition,note,quantity,thumb,storage_path,cutout_path,created_at";

/* -------------------------------------------------------------------------- */
/* Qué es cada cosa                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Cómo se llama cada tipo en pantalla.
 *
 * `one` nombra la cosa y `add` es la etiqueta del botón, que no siempre es la
 * misma palabra: "Compartimento" es correcto y nadie lo dice — en el botón
 * tiene que decir "Gaveta o repisa", que es lo que la persona está por crear.
 *
 * `short` existe porque el pie parte la fila en dos cuando hay dos tipos
 * posibles, y a 375 px "Agregar caja o bolsa" entra en media píldora como
 * "Agregar c…". Un botón truncado no dice nada: ahí va el sustantivo solo y
 * el verbo lo pone el signo de más.
 */
export const KIND_LABEL: Record<
  NodeKind,
  { one: string; many: string; add: string; short: string }
> = {
  room: { one: "Habitación", many: "Habitaciones", add: "Nueva habitación", short: "Habitación" },
  furniture: { one: "Mueble", many: "Muebles", add: "Agregar mueble", short: "Mueble" },
  compartment: {
    one: "Gaveta o repisa",
    many: "Gavetas y repisas",
    add: "Agregar gaveta",
    short: "Gaveta",
  },
  container: {
    one: "Contenedor",
    many: "Cajas y bolsas",
    add: "Agregar caja o bolsa",
    short: "Caja o bolsa",
  },
};

/**
 * Qué se puede crear dentro de qué.
 *
 * Los contenedores son los flexibles: una caja puede estar en el suelo del
 * cuarto, sobre un mueble, en una gaveta o dentro de otra caja. Los muebles y
 * las gavetas no, porque un armario dentro de una gaveta no es flexibilidad,
 * es un error de arrastre.
 */
export const CHILD_KINDS: Record<NodeKind, NodeKind[]> = {
  room: ["furniture", "container"],
  furniture: ["compartment", "container"],
  compartment: ["container"],
  container: ["container"],
};

/** El techo del árbol, el mismo que defiende el trigger de la 0018. */
export const MAX_DEPTH = 8;

export function isNodeKind(value: unknown): value is NodeKind {
  return value === "room" || value === "furniture" || value === "compartment" || value === "container";
}

export function isCondition(value: unknown): value is Condition {
  return (
    value === "new" || value === "good" || value === "used" || value === "worn" || value === "broken"
  );
}

/** Los hijos que este nodo todavía puede recibir sin pasarse de profundidad. */
export function allowedChildren(kind: NodeKind, depth: number): NodeKind[] {
  if (depth >= MAX_DEPTH) return [];
  return CHILD_KINDS[kind];
}

/* -------------------------------------------------------------------------- */
/* Los catálogos                                                               */
/* -------------------------------------------------------------------------- */

export type Variant = { key: string; label: string };

/**
 * Qué clase de mueble, de gaveta o de caja es.
 *
 * En los muebles esta clave es la que la Fase 3 va a usar para decidir qué
 * dibuja en la vista isométrica, así que las llaves son en inglés y estables:
 * la etiqueta se puede reescribir, `bed` no.
 *
 * Cada lista termina en "other" porque la alternativa es que alguien no pueda
 * registrar su mueble raro, y un inventario incompleto no se usa.
 */
export const VARIANTS: Record<NodeKind, Variant[]> = {
  room: [
    { key: "bedroom", label: "Cuarto" },
    { key: "living", label: "Sala" },
    { key: "kitchen", label: "Cocina" },
    { key: "bathroom", label: "Baño" },
    { key: "office", label: "Estudio" },
    { key: "garage", label: "Garaje" },
    { key: "storage", label: "Bodega" },
    { key: "other", label: "Otro" },
  ],
  furniture: [
    { key: "wardrobe", label: "Armario" },
    { key: "dresser", label: "Cómoda" },
    { key: "shelf", label: "Estantería" },
    { key: "desk", label: "Escritorio" },
    { key: "bed", label: "Cama" },
    { key: "nightstand", label: "Mesa de noche" },
    { key: "table", label: "Mesa" },
    { key: "cabinet", label: "Gabinete" },
    { key: "trunk", label: "Baúl" },
    { key: "other", label: "Otro" },
  ],
  compartment: [
    { key: "drawer", label: "Gaveta" },
    { key: "shelf", label: "Repisa" },
    { key: "door", label: "Puerta" },
    { key: "rail", label: "Barra de colgar" },
    { key: "cubby", label: "Cubículo" },
    { key: "other", label: "Otro" },
  ],
  container: [
    { key: "box", label: "Caja" },
    { key: "bag", label: "Bolsa" },
    { key: "case", label: "Estuche" },
    { key: "basket", label: "Canasta" },
    { key: "jar", label: "Frasco" },
    { key: "organizer", label: "Organizador" },
    { key: "envelope", label: "Sobre" },
    { key: "other", label: "Otro" },
  ],
};

export function variantLabel(kind: NodeKind, variant: string | null) {
  if (!variant) return null;
  return VARIANTS[kind].find((item) => item.key === variant)?.label ?? null;
}

export function isVariant(kind: NodeKind, value: unknown): value is string {
  return typeof value === "string" && VARIANTS[kind].some((item) => item.key === value);
}

export type Category = { key: string; label: string; hue: string };

/**
 * Las categorías de los ítems.
 *
 * El `hue` no es decoración: es lo que hace que una lista de cuarenta cosas se
 * pueda barrer con la vista en vez de leerse línea por línea. Cada categoría
 * tiene su color y lo conserva en toda la app, así que "los cables" se
 * reconocen por el color antes que por la palabra.
 *
 * "clothing" ya está acá aunque su módulo especial llegue en la Fase 4: la
 * ropa se registra desde el primer día como cualquier otra cosa, y lo que
 * agrega la Fase 4 es la foto sin fondo, no la categoría.
 */
export const CATEGORIES: Category[] = [
  { key: "cables", label: "Cables", hue: "#2f7ef3" },
  { key: "electronics", label: "Electrónica", hue: "#7a5cf0" },
  { key: "parts", label: "Componentes", hue: "#1d9c8a" },
  { key: "tools", label: "Herramientas", hue: "#c2561c" },
  { key: "stationery", label: "Papelería", hue: "#d1941b" },
  { key: "clothing", label: "Ropa", hue: "#d6456f" },
  { key: "shoes", label: "Calzado", hue: "#9c5a2b" },
  { key: "accessories", label: "Accesorios", hue: "#b5479e" },
  { key: "hygiene", label: "Higiene", hue: "#2a9fb5" },
  { key: "health", label: "Salud", hue: "#43a02b" },
  { key: "documents", label: "Documentos", hue: "#5a7184" },
  { key: "games", label: "Juegos", hue: "#e0603a" },
  { key: "sports", label: "Deporte", hue: "#2c8f55" },
  { key: "kitchen", label: "Cocina", hue: "#c0392b" },
  { key: "art", label: "Arte", hue: "#8e44ad" },
  { key: "other", label: "Otro", hue: "#6b7280" },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((item) => [item.key, item]));

/** La categoría, o la de "Otro" si llegó una clave que ya no existe. */
export function categoryOf(key: string): Category {
  return CATEGORY_MAP.get(key) ?? CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Qué categoría parece, a partir del nombre.
 *
 * Esto existe por una sola razón: un inventario de verdad son cientos de
 * cosas, y en cientos de cosas la categoría es el campo caro. El nombre se
 * escribe sin pensar —ya sabés qué tenés en la mano— pero elegir entre
 * dieciséis fichas es una decisión consciente por objeto, y dieciséis
 * decisiones conscientes por minuto es lo que hace que alguien abandone a los
 * veinte objetos.
 *
 * Así que la categoría se propone sola mientras se escribe y queda elegida.
 * Nunca se impone: la ficha propuesta se ve marcada y se cambia con un toque.
 * Adivinar mal cuesta un toque; no adivinar cuesta uno siempre.
 *
 * Las claves son raíces, no palabras: "cable" cubre cables y "cablecito", y
 * "pantalon" cubre pantalones. Gana la raíz más larga que coincida, que es lo
 * que hace que "memoria usb" caiga en componentes y no en cables.
 */
const HINTS: Record<string, string[]> = {
  cables: [
    "cable", "cargador", "usb", "hdmi", "extension", "alargue", "adaptador",
    "enchufe", "regleta", "auxiliar", "ethernet", "lightning",
  ],
  electronics: [
    "telefono", "celular", "laptop", "computadora", "monitor", "pantalla",
    "teclado", "mouse", "raton", "bocina", "parlante", "audifono", "auricular",
    "tablet", "router", "modem", "impresora", "radio", "reproductor",
  ],
  parts: [
    "memoria", "ram", "procesador", "tarjeta", "placa", "ventilador", "fuente",
    "ssd", "disco", "bateria", "pila", "sensor", "motor", "resistencia",
  ],
  tools: [
    "destornillador", "martillo", "pinza", "llave", "taladro", "alicate",
    "cinta", "sierra", "lija", "pegamento", "silicon", "nivel", "broca",
    "soldador", "multimetro",
  ],
  stationery: [
    "lapiz", "lapicero", "boligrafo", "pluma", "cuaderno", "libreta", "hoja",
    "tijera", "grapadora", "clip", "marcador", "resaltador", "borrador",
    "regla", "carpeta", "folder", "sobre", "libro", "agenda",
  ],
  clothing: [
    "camisa", "camiseta", "playera", "polo", "hoodie", "sudadera", "sueter",
    "chaqueta", "abrigo", "chumpa", "pantalon", "jean", "short", "bermuda",
    "calceta", "calcetin", "media", "ropa", "boxer", "vestido", "falda",
    "pijama", "traje", "saco", "blusa", "chaleco", "leggings",
  ],
  shoes: [
    "zapato", "tenis", "zapatilla", "bota", "sandalia", "chancla", "pantufla",
    "crocs", "mocasin", "tacon",
  ],
  accessories: [
    "reloj", "lentes", "gafas", "anillo", "collar", "pulsera", "arete",
    "cinturon", "faja", "cartera", "billetera", "mochila", "bolso", "llavero",
    "bufanda", "guante", "gorra", "sombrero",
  ],
  hygiene: [
    "jabon", "shampoo", "champu", "cepillo", "dental", "desodorante", "toalla",
    "perfume", "crema", "afeitar", "rasuradora", "cortauna", "higienico",
    "pañal", "algodon",
  ],
  health: [
    "medicina", "medicamento", "pastilla", "vitamina", "termometro", "venda",
    "curita", "alcohol", "jeringa", "ibuprofeno", "paracetamol",
    "acetaminofen", "suero", "inhalador",
  ],
  documents: [
    "documento", "pasaporte", "titulo", "diploma", "contrato", "factura",
    "recibo", "certificado", "identificacion", "cedula", "licencia", "poliza",
    "acta", "escritura", "garantia",
  ],
  games: [
    "juego", "consola", "control", "mando", "nintendo", "playstation", "xbox",
    "carta", "naipe", "ficha", "dado", "rompecabeza", "puzzle", "lego",
    "peluche", "figura",
  ],
  sports: [
    "pelota", "balon", "raqueta", "mancuerna", "pesa", "bicicleta", "casco",
    "patineta", "yoga", "colchoneta", "guayo", "canillera",
  ],
  kitchen: [
    "olla", "sarten", "plato", "vaso", "taza", "cuchara", "tenedor",
    "cuchillo", "licuadora", "cafetera", "tupper", "termo", "bandeja",
    "colador", "abrelata", "molde", "pajilla", "servilleta",
  ],
  art: [
    "pincel", "pintura", "acuarela", "lienzo", "oleo", "crayon", "arcilla",
    "plastilina", "temperas", "caballete",
  ],
};

/** Sin tildes y en minúsculas: nadie escribe "lápiz" con tilde en un apuro. */
function plain(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function guessCategory(name: string): string | null {
  const words = plain(name).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return null;

  let best: { key: string; length: number } | null = null;

  for (const [key, hints] of Object.entries(HINTS)) {
    for (const hint of hints) {
      /* La raíz tiene que abrir una palabra, no aparecer en cualquier lado:
         sin esto, "repuesto" contiene "puesto" y medio diccionario coincide
         con medio inventario. */
      if (!words.some((word) => word.startsWith(hint))) continue;
      if (!best || hint.length > best.length) best = { key, length: hint.length };
    }
  }

  return best?.key ?? null;
}

export function isCategory(value: unknown): value is string {
  return typeof value === "string" && CATEGORY_MAP.has(value);
}

/**
 * El estado de la cosa.
 *
 * `tone` es para la UI: "desgastado" y "roto" no son malas noticias que haya
 * que pintar en rojo de alarma —es un inventario, no un semáforo— pero sí
 * tienen que verse distintos de un salto de ojo para poder encontrar lo que
 * hay que reemplazar.
 */
export const CONDITIONS: { key: Condition; label: string; tone: "fresh" | "ok" | "worn" | "dead" }[] =
  [
    { key: "new", label: "Nuevo", tone: "fresh" },
    { key: "good", label: "Buen estado", tone: "ok" },
    { key: "used", label: "Usado", tone: "ok" },
    { key: "worn", label: "Desgastado", tone: "worn" },
    { key: "broken", label: "No funciona", tone: "dead" },
  ];

const CONDITION_MAP = new Map(CONDITIONS.map((item) => [item.key, item]));

export function conditionOf(key: Condition) {
  return CONDITION_MAP.get(key) ?? CONDITIONS[1];
}

/**
 * Los colores de las habitaciones.
 *
 * El resto de la app tiene un acento y uno solo; este módulo es el que
 * necesita ser colorido, y el color sale del dato —cada cuarto el suyo— no de
 * reemplazar la marca. Ocho alcanzan: nadie tiene nueve cuartos y, si los
 * tuviera, repetir un color es mejor que ofrecer una rueda de color.
 */
export const ROOM_COLORS = [
  "#2f7ef3",
  "#7a5cf0",
  "#1d9c8a",
  "#e0603a",
  "#d6456f",
  "#d1941b",
  "#43a02b",
  "#5a7184",
] as const;

export function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** El color que le toca a una habitación nueva: el siguiente sin usar. */
export function nextColor(used: (string | null)[]) {
  const taken = new Set(used.filter(Boolean));
  return ROOM_COLORS.find((color) => !taken.has(color)) ?? ROOM_COLORS[0];
}

/* -------------------------------------------------------------------------- */
/* La ruta                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * "Cuarto > Armario > Gaveta 2 > Bolsa negra".
 *
 * El último tramo se puede soltar (`skipLast`) porque en la pantalla de un
 * contenedor su propio nombre ya está como titular arriba: repetirlo al final
 * de la ruta es ruido.
 */
export function pathLabel(path: string[], { skipLast = false } = {}) {
  const parts = skipLast ? path.slice(0, -1) : path;
  return parts.join(" › ");
}

/**
 * Los nodos de una rama, en el orden en que se muestran.
 *
 * Primero los muebles y después las cajas —lo grande antes que lo chico— y
 * dentro de cada grupo lo que la persona ordenó a mano, con la fecha como
 * desempate para que la lista no baile entre dos cargas.
 */
const KIND_WEIGHT: Record<NodeKind, number> = {
  room: 0,
  furniture: 1,
  compartment: 2,
  container: 3,
};

export function sortNodes(nodes: RoomNode[]) {
  return [...nodes].sort(
    (a, b) =>
      KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind] ||
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at)
  );
}

/* -------------------------------------------------------------------------- */
/* Las cuentas                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cuántas cosas hay dentro de cada rama, contando todo lo que cuelga.
 *
 * Se resuelve en una pasada sobre `path_ids`: cada ítem sabe en qué nodo está
 * y cada nodo sabe quiénes son sus ancestros, así que sumar al ancestro es
 * recorrer el array y nada más. La alternativa era una consulta recursiva por
 * cada tarjeta de la pantalla.
 *
 * Suma `quantity`, no filas: una bolsa con cuarenta clips son cuarenta clips.
 */
export function countsByNode(
  nodes: RoomNode[],
  /* Pide lo mínimo —dónde está y cuántos son— para que la pantalla pueda
     traer solo esas dos columnas y no el inventario entero. Un `Item` lo
     cumple igual, así que la lista de un nodo también sirve de entrada. */
  items: { node_id: string; quantity: number }[]
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const totals = new Map<string, number>();

  for (const item of items) {
    const node = nodeById.get(item.node_id);
    if (!node) continue;

    for (const ancestor of node.path_ids) {
      totals.set(ancestor, (totals.get(ancestor) ?? 0) + item.quantity);
    }
  }

  return totals;
}

/** "3 cosas" / "1 cosa" / "Vacío" — el subtítulo de cada tarjeta. */
export function countLabel(total: number) {
  if (total <= 0) return "Vacío";
  return total === 1 ? "1 cosa" : `${total} cosas`;
}

/**
 * El color de una rama.
 *
 * Solo las habitaciones tienen color propio; todo lo que cuelga lo hereda.
 * No es ahorro de columnas: que el armario, sus gavetas y sus cajas sean del
 * mismo color del cuarto es lo que hace que al bajar tres niveles se siga
 * sabiendo en qué cuarto estás, sin leer la ruta.
 */
export function branchTone(node: RoomNode, nodes: RoomNode[]) {
  if (node.color) return node.color;

  const rootId = node.path_ids[0];
  const root = nodes.find((candidate) => candidate.id === rootId);

  return root?.color ?? ROOM_COLORS[0];
}

/**
 * Todos los lugares donde puede estar una cosa, con su ruta escrita.
 *
 * Es lo que llena el selector de "¿dónde está?" al editar un objeto. Se
 * ordena por la ruta y no por fecha: el selector se lee como un índice del
 * inventario, así que los cajones del mismo mueble tienen que quedar juntos.
 */
export function placesOf(nodes: RoomNode[]) {
  return nodes
    .map((node) => ({ id: node.id, label: pathLabel(node.path) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/* -------------------------------------------------------------------------- */
/* El buscador                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * "Bolígrafo" tiene que aparecer escribiendo "boligrafo".
 *
 * Nadie pone tildes buscando algo en su propio cuarto, y un buscador que
 * exige escribir "memoria RAM" con mayúsculas no se usa dos veces. Se
 * normaliza a minúsculas y se le quitan los diacríticos a las dos puntas de
 * la comparación.
 */
export function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type Hit = {
  item: IndexEntry;
  /** La ruta exacta: "Cuarto › Armario › Gaveta 2 › Bolsa negra". */
  where: string;
  nodeId: string;
};

/**
 * Lo que coincide con lo que se escribió, con su ubicación.
 *
 * Busca en el nombre y en la categoría: quien escribe "cable" quiere el cable
 * HDMI, y quien escribe "ropa" quiere ver la ropa aunque ninguna prenda se
 * llame así.
 *
 * Ordena por dónde cae la coincidencia, no alfabéticamente: lo que *empieza*
 * con lo escrito va primero, porque buscando "cable" el "Cable HDMI" importa
 * más que la "Caja de cables viejos". Dentro de cada grupo, el nombre más
 * corto arriba — es el que más se parece a lo que se buscó.
 */
export function search(index: IndexEntry[], nodes: RoomNode[], query: string, limit = 40) {
  const needle = fold(query);
  if (needle.length < 2) return [] as Hit[];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const hits = index.flatMap((item) => {
    const name = fold(item.name);
    const category = fold(categoryOf(item.category).label);

    const at = name.indexOf(needle);
    const byCategory = at < 0 && category.includes(needle);
    if (at < 0 && !byCategory) return [];

    const node = nodeById.get(item.node_id);

    return [
      {
        hit: {
          item,
          where: node ? pathLabel(node.path) : "Sin ubicación",
          nodeId: item.node_id,
        } satisfies Hit,
        // 0 empieza con lo escrito · 1 lo contiene · 2 solo la categoría
        rank: byCategory ? 2 : at === 0 ? 0 : 1,
      },
    ];
  });

  return hits
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.hit.item.name.length - b.hit.item.name.length ||
        a.hit.item.name.localeCompare(b.hit.item.name, "es")
    )
    .slice(0, limit)
    .map((entry) => entry.hit);
}
