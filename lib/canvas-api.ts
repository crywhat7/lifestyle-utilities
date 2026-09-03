import "server-only";
import {
  htmlToText,
  type CanvasAssignment,
  type CanvasCourse,
} from "@/lib/canvas";

/**
 * El lado de la red de Canvas Studio.
 *
 * Canvas es una API REST vieja y honesta: token en la cabecera, paginación en
 * el `Link`, y todo lo demás es leer JSON. Lo único delicado es que el token
 * es de la persona y no nuestro, así que cada llamada recibe el suyo y nada
 * se guarda en un módulo compartido.
 */

export type CanvasFailure =
  | "auth" // el token no sirve o expiró
  | "not_found" // el dominio no es un Canvas
  | "rate" // demasiadas peticiones
  | "timeout"
  | "network"
  | "bad_response";

export type CanvasResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: CanvasFailure };

export type CanvasCreds = { baseUrl: string; token: string };

const TIMEOUT_MS = 15_000;
/** Techo de páginas por consulta: 100 por página ya cubre un semestre entero. */
const MAX_PAGES = 5;

/** El mensaje que ve la persona. Nunca el cuerpo crudo de Canvas. */
export const FAILURE_MESSAGE: Record<CanvasFailure, string> = {
  auth: "Canvas rechazó la llave. Generá una nueva y volvé a pegarla.",
  not_found: "Ese dominio no responde como un Canvas. Revisá la dirección.",
  rate: "Canvas está limitando las peticiones. Probá en un minuto.",
  timeout: "Canvas tardó demasiado en responder.",
  network: "No se pudo llegar a Canvas.",
  bad_response: "Canvas respondió algo que no supimos leer.",
};

function logFailure(label: string, detail?: string) {
  console.error(`[canvas] ${label}`, detail ? detail.slice(0, 300) : "");
}

/**
 * La siguiente página, si la hay.
 *
 * Canvas la manda en el `Link` con `rel="next"`, y esa URL ya trae el cursor
 * armado: seguirla es más confiable que ir sumando `page=`.
 */
function nextLink(header: string | null) {
  if (!header) return null;

  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }

  return null;
}

/** Una llamada a Canvas, con todas sus páginas juntas. */
async function canvasGet<T>(
  creds: CanvasCreds,
  path: string,
  paginate = true
): Promise<CanvasResult<T[]>> {
  let url: string | null = `${creds.baseUrl}/api/v1${path}`;
  const rows: T[] = [];

  for (let page = 0; url && page < MAX_PAGES; page++) {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Accept: "application/json",
        },
        // El token es de la persona: nada de esto se cachea en el borde.
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      logFailure(
        `${path} ${timedOut ? "expiró" : "falló por red"}`,
        error instanceof Error ? error.message : String(error)
      );
      return { ok: false, kind: timedOut ? "timeout" : "network" };
    }

    if (!response.ok) {
      logFailure(`${path} devolvió HTTP ${response.status}`);

      if (response.status === 401 || response.status === 403) {
        return { ok: false, kind: "auth" };
      }
      if (response.status === 404) return { ok: false, kind: "not_found" };
      if (response.status === 429) return { ok: false, kind: "rate" };
      return { ok: false, kind: "bad_response" };
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      // Un dominio que existe pero no es Canvas devuelve HTML acá.
      return { ok: false, kind: "not_found" };
    }

    if (Array.isArray(payload)) rows.push(...(payload as T[]));
    else rows.push(payload as T);

    url = paginate ? nextLink(response.headers.get("link")) : null;
  }

  return { ok: true, data: rows };
}

/* -------------------------------------------------------------------------- */
/* Quién sos en Canvas                                                         */
/* -------------------------------------------------------------------------- */

type ProfileRow = { name?: string; short_name?: string };

/**
 * La prueba de que la llave sirve.
 *
 * Se pide antes de guardar nada: si el token está vencido o el dominio no es
 * el de la escuela, la persona se entera en el formulario y no dos pantallas
 * más adelante con una lista vacía que no explica nada.
 */
export async function fetchProfile(
  creds: CanvasCreds
): Promise<CanvasResult<string>> {
  const outcome = await canvasGet<ProfileRow>(
    creds,
    "/users/self/profile",
    false
  );

  if (!outcome.ok) return outcome;

  const row = outcome.data[0];
  if (!row) return { ok: false, kind: "bad_response" };

  return { ok: true, data: (row.name ?? row.short_name ?? "").slice(0, 80) };
}

/* -------------------------------------------------------------------------- */
/* Los cursos                                                                  */
/* -------------------------------------------------------------------------- */

type CourseRow = {
  id?: number;
  name?: string;
  course_code?: string;
  access_restricted_by_date?: boolean;
  term?: { name?: string };
};

/** Los cursos en los que la matrícula está activa, ordenados por nombre. */
export async function fetchCourses(
  creds: CanvasCreds
): Promise<CanvasResult<Omit<CanvasCourse, "followed">[]>> {
  const outcome = await canvasGet<CourseRow>(
    creds,
    "/courses?enrollment_state=active&per_page=100&include[]=term"
  );

  if (!outcome.ok) return outcome;

  const courses = outcome.data
    // Canvas devuelve cursos "restringidos por fecha" como cáscaras sin
    // nombre. No son cursos, son ruido de un semestre cerrado.
    .filter((row) => row.id && row.name && !row.access_restricted_by_date)
    .map((row) => ({
      course_id: Number(row.id),
      name: String(row.name).slice(0, 160),
      code: row.course_code ? String(row.course_code).slice(0, 60) : null,
      term: row.term?.name ? String(row.term.name).slice(0, 60) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return { ok: true, data: courses };
}

/* -------------------------------------------------------------------------- */
/* Las tareas pendientes                                                       */
/* -------------------------------------------------------------------------- */

type SubmissionRow = {
  workflow_state?: string;
  submitted_at?: string | null;
  attempt?: number | null;
};

type AssignmentRow = {
  id?: number;
  name?: string;
  description?: string | null;
  html_url?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  published?: boolean;
  omit_from_final_grade?: boolean;
  submission?: SubmissionRow | null;
};

/**
 * ¿Esta tarea sigue pendiente de entregar?
 *
 * Canvas no tiene un campo "pendiente": tiene el estado de tu entrega. Sin
 * entrega, o con una entrega en estado `unsubmitted`, la tarea todavía te
 * espera. Todo lo demás —entregada, calificada, con nota puesta a mano— ya no
 * es tu problema y no tiene por qué aparecer en la lista.
 */
function isPending(row: AssignmentRow) {
  const submission = row.submission;
  if (!submission) return true;
  if (submission.submitted_at) return false;

  const state = submission.workflow_state ?? "unsubmitted";
  return state === "unsubmitted" || state === "pending_review";
}

export type PendingQuery = {
  courses: { course_id: number; name: string }[];
  /** Cuántas semanas hacia atrás mirar. Lo vencido más viejo no aparece. */
  weeks: number;
  /** El "ahora" del servidor, para calcular la ventana una sola vez. */
  now: Date;
};

/**
 * Las tareas pendientes de los cursos elegidos, dentro de la ventana.
 *
 * La ventana existe porque un semestre arrastra tareas de hace meses que
 * nadie va a entregar nunca: mirarlas solo sirve para sentirse mal. Diez
 * semanas es lo que dura un ciclo real de trabajo.
 *
 * Los cursos se piden en paralelo. Si uno falla —un curso archivado a mitad
 * de la sincronización— los demás siguen: media lista es infinitamente mejor
 * que una pantalla de error.
 */
export async function fetchPending(
  creds: CanvasCreds,
  query: PendingQuery
): Promise<CanvasResult<CanvasAssignment[]>> {
  if (query.courses.length === 0) return { ok: true, data: [] };

  const floor = new Date(query.now);
  floor.setDate(floor.getDate() - query.weeks * 7);
  const floorIso = floor.toISOString();

  const results = await Promise.all(
    query.courses.map((course) =>
      canvasGet<AssignmentRow>(
        creds,
        `/courses/${course.course_id}/assignments` +
          "?per_page=100&order_by=due_at&include[]=submission"
      ).then((outcome) => ({ course, outcome }))
    )
  );

  // Si TODOS fallaron por lo mismo, es un problema de la llave o del dominio
  // y hay que decirlo. Si falló uno solo, es ese curso y la lista sigue.
  const failures = results.filter((result) => !result.outcome.ok);
  if (failures.length === results.length) {
    const first = failures[0].outcome as { ok: false; kind: CanvasFailure };
    return { ok: false, kind: first.kind };
  }

  const pending: CanvasAssignment[] = [];

  for (const { course, outcome } of results) {
    if (!outcome.ok) continue;

    for (const row of outcome.data) {
      if (!row.id || !row.name) continue;
      if (row.published === false) continue;
      if (!isPending(row)) continue;

      // Sin fecha se queda: es una tarea abierta del curso, no una vieja.
      if (row.due_at && row.due_at < floorIso) continue;

      pending.push({
        assignment_id: Number(row.id),
        course_id: course.course_id,
        course_name: course.name,
        title: String(row.name).trim().slice(0, 200),
        instructions: htmlToText(row.description).slice(0, 12_000) || null,
        html_url: row.html_url ?? null,
        due_at: row.due_at ?? null,
        points:
          typeof row.points_possible === "number" ? row.points_possible : null,
      });
    }
  }

  return { ok: true, data: pending };
}

/* -------------------------------------------------------------------------- */
/* El enunciado crudo y sus archivos                                           */
/* -------------------------------------------------------------------------- */

/**
 * El HTML del enunciado, tal como lo guarda Canvas.
 *
 * La lista de pendientes ya trae el texto limpio, que es lo que lee la IA.
 * Esto se pide aparte y solo al importar, porque el `href` de cada enlace
 * —lo único que interesa acá— es justamente lo que el limpiado tira.
 */
export async function fetchAssignmentHtml(
  creds: CanvasCreds,
  courseId: number,
  assignmentId: number
): Promise<CanvasResult<string>> {
  const outcome = await canvasGet<{ description?: string | null }>(
    creds,
    `/courses/${courseId}/assignments/${assignmentId}`,
    false
  );

  if (!outcome.ok) return outcome;
  return { ok: true, data: outcome.data[0]?.description ?? "" };
}

export type CanvasFileMeta = {
  name: string;
  /** La dirección de descarga que Canvas firma para esta sesión. */
  url: string;
  mime: string | null;
  bytes: number | null;
};

/**
 * Los datos de un archivo del curso.
 *
 * Vale la pena el viaje extra: el `display_name` es el nombre real
 * ("Rúbrica final.docx"), mientras que la dirección suele terminar en un
 * número. Y el `url` que devuelve ya viene con el verificador, así que la
 * descarga no depende de que la llave tenga permiso sobre ese curso.
 */
export async function fetchFileMeta(
  creds: CanvasCreds,
  fileId: number
): Promise<CanvasResult<CanvasFileMeta>> {
  const outcome = await canvasGet<{
    display_name?: string;
    filename?: string;
    url?: string;
    "content-type"?: string;
    size?: number;
  }>(creds, `/files/${fileId}`, false);

  if (!outcome.ok) return outcome;

  const row = outcome.data[0];
  if (!row?.url) return { ok: false, kind: "not_found" };

  return {
    ok: true,
    data: {
      name: String(row.display_name ?? row.filename ?? `archivo-${fileId}`).slice(0, 200),
      url: row.url,
      mime: row["content-type"] ?? null,
      bytes: typeof row.size === "number" ? row.size : null,
    },
  };
}

export type Downloaded = {
  bytes: Buffer;
  mime: string;
  /** El nombre que declaró el servidor, si lo declaró. */
  name: string | null;
};

export type DownloadFailure =
  | "too_big"
  | "not_a_file"
  | "unreachable"
  | "forbidden";

export const DOWNLOAD_MESSAGE: Record<DownloadFailure, string> = {
  too_big: "Pesa más de lo que guardamos.",
  not_a_file: "El enlace lleva a una página, no a un archivo.",
  unreachable: "No respondió.",
  forbidden: "Pide iniciar sesión para bajarlo.",
};

/** Lo que entra al bucket. Más grande que esto se queda como enlace. */
export const MAX_FILE_BYTES = 12_000_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** El nombre que el servidor propone en `Content-Disposition`. */
function dispositionName(header: string | null) {
  if (!header) return null;

  const star = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].replace(/^["']|["']$/g, ""));
    } catch {
      /* sigue con el simple */
    }
  }

  const plain = header.match(/filename=["']?([^"';]+)/i);
  return plain ? plain[1].trim() : null;
}

/**
 * Baja un archivo, con techo de peso y sin creerle a la extensión.
 *
 * La extensión de la dirección es una promesa, no un hecho: media web sirve
 * una página de inicio de sesión en una URL que termina en `.pdf`. Lo que
 * decide es el `Content-Type` que llega, y si llega HTML esto no era un
 * archivo — se guarda como enlace y se sigue.
 *
 * El token viaja solo hacia el propio Canvas. Mandárselo a un dominio
 * cualquiera porque el enunciado lo enlazó sería regalar la llave.
 */
export async function downloadFile(
  url: string,
  token?: string
): Promise<{ ok: true; data: Downloaded } | { ok: false; kind: DownloadFailure }> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: "unreachable" };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, kind: "forbidden" };
  }

  if (!response.ok) return { ok: false, kind: "unreachable" };

  const mime = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!mime || mime.startsWith("text/html") || mime.includes("xhtml")) {
    return { ok: false, kind: "not_a_file" };
  }

  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
    return { ok: false, kind: "too_big" };
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Sin `Content-Length` el techo se comprueba recién acá, con los bytes en
  // la mano: es tarde para ahorrar la descarga, pero no para no guardarla.
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return { ok: false, kind: "too_big" };
  }

  return {
    ok: true,
    data: {
      bytes: buffer,
      mime: mime || "application/octet-stream",
      name: dispositionName(response.headers.get("content-disposition")),
    },
  };
}
