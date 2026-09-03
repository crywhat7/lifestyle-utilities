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
