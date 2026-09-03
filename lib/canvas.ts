/**
 * Canvas Studio — los tipos y la aritmética, sin red.
 *
 * Todo lo que el servidor y el navegador tienen que entender igual vive acá:
 * qué es una tarea pendiente, cuándo vence, cómo se ve un dominio válido y
 * cómo se limpia el HTML que Canvas manda como "instrucciones".
 */

export const DEFAULT_WEEKS = 10;
export const MIN_WEEKS = 1;
export const MAX_WEEKS = 52;

/** Un curso del semestre, tal como lo devolvió Canvas más nuestra elección. */
export type CanvasCourse = {
  course_id: number;
  name: string;
  code: string | null;
  term: string | null;
  followed: boolean;
};

/** Una tarea pendiente, viva en Canvas. Todavía no toca la base. */
export type CanvasAssignment = {
  assignment_id: number;
  course_id: number;
  course_name: string;
  title: string;
  instructions: string | null;
  html_url: string | null;
  /** ISO con zona, o nulo: Canvas permite tareas sin fecha de entrega. */
  due_at: string | null;
  points: number | null;
};

/** Ya importada: la fila nuestra, con el puente a Clean Daily. */
export type StoredAssignment = CanvasAssignment & {
  id: string;
  task_id: string | null;
  imported_at: string;
};

export type CanvasDraft = {
  id: string;
  assignment_id: string;
  extra_prompt: string | null;
  sources: string | null;
  latex: string | null;
  model: string | null;
  status: "ready" | "failed";
  error: string | null;
  created_at: string;
};

export type CanvasConnection = {
  base_url: string;
  weeks: number;
  account_name: string | null;
  last_sync_at: string | null;
};

/* -------------------------------------------------------------------------- */
/* El dominio de la escuela                                                    */
/* -------------------------------------------------------------------------- */

/**
 * De lo que la persona pegue a "https://escuela.instructure.com".
 *
 * Pega de todo: la URL completa de una tarea, el dominio pelado, con barra
 * final, con http, con espacios. Todo eso es el mismo Canvas y ninguno
 * merece un error de formulario.
 */
export function normalizeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    // Solo https: el token viaja en cada petición y no sale sin cifrar.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(url.hostname)) return null;
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}

/** El nombre corto de la escuela, para decirlo en pantalla sin el ruido. */
export function schoolLabel(baseUrl: string) {
  return baseUrl.replace(/^https:\/\//, "").replace(/\.instructure\.com$/, "");
}

export function clampWeeks(value: number | null) {
  if (value == null || !Number.isFinite(value)) return DEFAULT_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(value)));
}

/* -------------------------------------------------------------------------- */
/* El HTML de Canvas, convertido en algo que se pueda leer y prompt-ear        */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

/**
 * Las instrucciones sin etiquetas, con los saltos que importan.
 *
 * No es un sanitizador de seguridad —el texto nunca vuelve al DOM como
 * HTML— es un traductor: los `<li>` se vuelven guiones y los `<p>` saltos,
 * porque una lista de requisitos aplastada en un párrafo se lee mal y, sobre
 * todo, la IA la interpreta peor.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n· ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li|ul|ol|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* El tiempo que queda                                                         */
/* -------------------------------------------------------------------------- */

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

export type DueRead = {
  tone: DueTone;
  /** "Vence hoy", "Faltan 3 días", "Venció hace 2 días". */
  label: string;
  /** Días enteros que faltan; negativo si ya venció. Nulo sin fecha. */
  days: number | null;
};

/**
 * Cuánto falta, dicho como se lo diría una persona.
 *
 * Se resuelve contra un `now` que se pasa por parámetro y no contra el reloj
 * del módulo: el servidor pinta esto en el HTML y si el navegador lo
 * recalculara con su propio reloj, React tiraría un error de hidratación en
 * cada carga.
 */
export function readDue(dueAt: string | null, now: Date): DueRead {
  if (!dueAt) return { tone: "none", label: "Sin fecha", days: null };

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return { tone: "none", label: "Sin fecha", days: null };
  }

  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const days = Math.round((startOf(due) - startOf(now)) / 86_400_000);

  if (days < 0) {
    const late = Math.abs(days);
    return {
      tone: "overdue",
      days,
      label: late === 1 ? "Venció ayer" : `Venció hace ${late} días`,
    };
  }

  if (days === 0) return { tone: "today", days, label: "Vence hoy" };
  if (days === 1) return { tone: "soon", days, label: "Vence mañana" };
  if (days <= 7) return { tone: "soon", days, label: `Faltan ${days} días` };

  return { tone: "later", days, label: `Faltan ${days} días` };
}

/** "mié 12 de marzo, 23:59" — la fecha completa, para el detalle. */
export function longDue(dueAt: string | null) {
  if (!dueAt) return "Sin fecha de entrega";

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "Sin fecha de entrega";

  return due.toLocaleString("es-GT", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** El orden de la pantalla: lo más vencido arriba, lo sin fecha al final. */
export function byDue<T extends { due_at: string | null }>(a: T, b: T) {
  if (a.due_at === b.due_at) return 0;
  if (!a.due_at) return 1;
  if (!b.due_at) return -1;
  return a.due_at < b.due_at ? -1 : 1;
}

/* -------------------------------------------------------------------------- */
/* Filtros y orden de la importación                                           */
/* -------------------------------------------------------------------------- */

/**
 * Con qué recorte se mira la lista que devolvió Canvas.
 *
 * No son categorías del sistema: son las cuatro preguntas que alguien se hace
 * de verdad frente a treinta tareas. "¿Qué debo?", "¿qué se me viene?",
 * "¿qué hay esta semana?" y "¿qué quedó sin fecha?".
 */
export type DueFilter = "all" | "overdue" | "week" | "upcoming" | "undated";

export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "overdue", label: "Vencidas" },
  { value: "week", label: "Esta semana" },
  { value: "upcoming", label: "Próximas" },
  { value: "undated", label: "Sin fecha" },
];

export type SortKey = "due" | "due_desc" | "course" | "title" | "points";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "due", label: "Lo más urgente" },
  { value: "due_desc", label: "Lo más lejano" },
  { value: "course", label: "Por curso" },
  { value: "title", label: "Por título" },
  { value: "points", label: "Por puntaje" },
];

export function passesFilter<T extends { due_at: string | null }>(
  row: T,
  filter: DueFilter,
  now: Date
) {
  if (filter === "all") return true;

  const due = readDue(row.due_at, now);

  if (filter === "undated") return due.days == null;
  if (due.days == null) return false;
  if (filter === "overdue") return due.days < 0;
  if (filter === "week") return due.days >= 0 && due.days <= 7;
  return due.days >= 0; // upcoming
}

/**
 * Ordena una copia, nunca el arreglo original.
 *
 * En "lo más urgente" y "lo más lejano" las tareas sin fecha van siempre al
 * final: no tienen dónde caer en una línea de tiempo y ponerlas primero —que
 * es lo que hace un `sort` ingenuo con los nulos— esconde lo que vence
 * mañana debajo de lo que no vence nunca.
 */
export function sortAssignments<
  T extends {
    due_at: string | null;
    title: string;
    course_name: string;
    points: number | null;
  },
>(rows: T[], key: SortKey): T[] {
  const copy = [...rows];

  if (key === "due") return copy.sort(byDue);

  if (key === "due_desc") {
    return copy.sort((a, b) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at < b.due_at ? 1 : -1;
    });
  }

  if (key === "course") {
    return copy.sort(
      (a, b) => a.course_name.localeCompare(b.course_name, "es") || byDue(a, b)
    );
  }

  if (key === "title") {
    return copy.sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  return copy.sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || byDue(a, b));
}

/* -------------------------------------------------------------------------- */
/* El material: enlaces y archivos del enunciado                               */
/* -------------------------------------------------------------------------- */

export type CanvasFile = {
  id: string;
  assignment_id: string;
  kind: "file" | "link";
  status: "ready" | "failed";
  name: string;
  source_url: string;
  mime: string | null;
  bytes: number | null;
  storage_path: string | null;
  error: string | null;
  created_at: string;
};

/** Lo que se encontró en el enunciado, antes de intentar bajarlo. */
export type FoundLink = {
  url: string;
  label: string;
  /**
   * canvas — un archivo del curso: se baja con la llave de la persona.
   * file   — una dirección que termina en un archivo: se baja sin llave.
   * link   — una página. Se guarda la dirección, no hay nada que bajar.
   */
  kind: "canvas" | "file" | "link";
};

/** Extensiones que valen como "esto es un documento, no una página". */
const FILE_EXT =
  /\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|rtf|odt|ods|odp|zip|rar|7z|png|jpe?g|gif|webp|svg|tex|ipynb|m|py|r|sql|epub)(?=$|[?#])/i;

/** Un archivo servido por el propio Canvas, con o sin curso en la ruta. */
const CANVAS_FILE = /\/(?:courses\/\d+\/)?files\/(\d+)/;

/** El id del archivo de Canvas dentro de una dirección suya. */
export function canvasFileId(url: string) {
  const match = url.match(CANVAS_FILE);
  return match ? Number(match[1]) : null;
}

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Todo lo enlazado en el enunciado, con su nombre visible.
 *
 * Se lee el HTML crudo de Canvas —no el texto limpio— porque el `href` es
 * justamente lo que `htmlToText` tira. El nombre sale del texto del enlace,
 * que casi siempre ES el nombre del archivo ("Plantilla informe.docx"); si el
 * enlace no dice nada, se cae al último tramo de la dirección.
 *
 * Se descartan los anclas internas, los `mailto:` y los `javascript:`, que no
 * son material de nadie.
 */
export function extractLinks(
  html: string | null | undefined,
  baseUrl: string
): FoundLink[] {
  if (!html) return [];

  const found = new Map<string, FoundLink>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchor)) {
    const raw = decodeEntities(match[1]).trim();

    if (!raw || raw.startsWith("#") || /^(mailto|javascript|tel):/i.test(raw)) {
      continue;
    }

    let url: string;

    try {
      // Canvas enlaza sus propios archivos en relativo: "/courses/1/files/2".
      url = new URL(raw, `${baseUrl}/`).toString();
    } catch {
      continue;
    }

    if (!/^https?:/i.test(url)) continue;
    if (found.has(url)) continue;

    const text = decodeEntities(match[2].replace(/<[^>]+>/g, "")).trim();
    const tail = (() => {
      try {
        const path = new URL(url).pathname.split("/").filter(Boolean).pop();
        return path ? decodeURIComponent(path) : "";
      } catch {
        return "";
      }
    })();

    const isCanvas = url.startsWith(baseUrl) && CANVAS_FILE.test(url);

    found.set(url, {
      url,
      label: (text || tail || url).slice(0, 200),
      kind: isCanvas ? "canvas" : FILE_EXT.test(url) ? "file" : "link",
    });
  }

  return [...found.values()];
}

/** "1,2 MB" — el peso, dicho corto. */
export function weightLabel(bytes: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * El "origen" con el que se guarda el PDF compilado de un borrador.
 *
 * Los archivos del material se identifican por la dirección de donde
 * salieron; un PDF que compilamos nosotros no viene de ninguna, así que usa
 * el borrador como origen. Sirve de clave: una compilación por versión.
 */
export function draftSourceUrl(draftId: string) {
  return `draft:${draftId}`;
}

/** Si esta fila del material es el PDF de un borrador y no un recurso de Canvas. */
export function isDraftPdf(sourceUrl: string) {
  return sourceUrl.startsWith("draft:");
}
