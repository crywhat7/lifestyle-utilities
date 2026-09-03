import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import type {
  CanvasConnection,
  CanvasCourse,
  CanvasDraft,
  StoredAssignment,
} from "@/lib/canvas";
import type { CanvasCreds } from "@/lib/canvas-api";
import { createClient } from "@/lib/supabase/server";

export { CANVAS_PATH, LINK_PATH, TASK_PATH } from "./paths";

/**
 * El cliente y la persona, sin salir a la red.
 *
 * La sesión ya la verificó el proxy en esta misma petición, así que las
 * consultas de la pantalla pueden salir todas juntas.
 */
export async function canvasClient() {
  const user = await currentUser();
  if (!user) redirect("/");

  return { supabase: await createClient("lifestyle_utilities"), user };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * La conexión SIN el token.
 *
 * Es lo que ven las pantallas. El token se pide aparte y solo desde el
 * servidor, para que no exista ninguna ruta por la que pueda terminar en el
 * HTML que viaja al navegador.
 */
export async function loadConnection(
  client: Client,
  userId: string
): Promise<CanvasConnection | null> {
  const { data } = await client
    .from("canvas_connections")
    .select("base_url,weeks,account_name,last_sync_at")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as CanvasConnection | null) ?? null;
}

/** La llave, para hablar con Canvas. Nunca sale de una Server Action. */
export async function loadCreds(
  client: Client,
  userId: string
): Promise<(CanvasCreds & { weeks: number }) | null> {
  const { data } = await client
    .from("canvas_connections")
    .select("base_url,access_token,weeks")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const row = data as { base_url: string; access_token: string; weeks: number };
  return { baseUrl: row.base_url, token: row.access_token, weeks: row.weeks };
}

export async function loadCourses(
  client: Client,
  userId: string
): Promise<CanvasCourse[]> {
  const { data } = await client
    .from("canvas_courses")
    .select("course_id,name,code,term,followed")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  return (data ?? []) as CanvasCourse[];
}

const ASSIGNMENT_COLUMNS =
  "id,assignment_id,course_id,course_name,title,instructions,html_url,due_at,points,task_id,imported_at";

/** Las tareas importadas, lo más urgente primero y lo sin fecha al final. */
export async function loadAssignments(
  client: Client,
  userId: string
): Promise<StoredAssignment[]> {
  const { data } = await client
    .from("canvas_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("user_id", userId)
    .order("due_at", { ascending: true, nullsFirst: false });

  return (data ?? []) as StoredAssignment[];
}

export async function loadAssignment(
  client: Client,
  userId: string,
  id: string
): Promise<StoredAssignment | null> {
  const { data } = await client
    .from("canvas_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as StoredAssignment | null) ?? null;
}

/** Los borradores de una tarea, el último arriba. */
export async function loadDrafts(
  client: Client,
  assignmentId: string
): Promise<CanvasDraft[]> {
  const { data } = await client
    .from("canvas_drafts")
    .select("id,assignment_id,extra_prompt,sources,latex,model,status,error,created_at")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false });

  return (data ?? []) as CanvasDraft[];
}

/**
 * Qué recordatorios de Clean Daily siguen abiertos, de los que importamos.
 *
 * Se pregunta por lote y no de a uno: la pantalla necesita saber cuáles ya se
 * marcaron para no ofrecer "quitar el recordatorio" de algo que ya no existe.
 */
export async function loadOpenTaskIds(
  client: Client,
  userId: string,
  taskIds: string[]
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();

  const { data } = await client
    .from("clean_tasks")
    .select("id")
    .eq("user_id", userId)
    .in("id", taskIds);

  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}
