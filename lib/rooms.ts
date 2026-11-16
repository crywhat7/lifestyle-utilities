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
  sort_order: number;
  path: string[];
  path_ids: string[];
  depth: number;
  created_at: string;
};

/** Una cosa. Las dos columnas de foto llegan vacías hasta la Fase 2. */
export type Item = {
  id: string;
  node_id: string;
  name: string;
  category: string;
  condition: Condition;
  note: string | null;
  quantity: number;
  thumb: string | null;
  created_at: string;
};

export const NODE_COLUMNS =
  "id,parent_id,kind,name,variant,note,quantity,color,wall_color,floor_color,sort_order,path,path_ids,depth,created_at";

export const ITEM_COLUMNS =
  "id,node_id,name,category,condition,note,quantity,thumb,created_at";

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
