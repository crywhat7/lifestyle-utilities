"use server";

import { revalidatePath } from "next/cache";
import {
  clampWeeks,
  normalizeBaseUrl,
  type CanvasAssignment,
} from "@/lib/canvas";
import {
  fetchCourses,
  fetchPending,
  fetchProfile,
  FAILURE_MESSAGE,
} from "@/lib/canvas-api";
import { CANVAS_PATH, LINK_PATH, canvasClient, loadCreds } from "./data";

export type FormState = { status: "idle" | "saved" | "error"; error?: string };

export type PendingState =
  | { status: "idle" }
  | { status: "ready"; pending: CanvasAssignment[] }
  | { status: "error"; error: string };

function refresh() {
  revalidatePath(CANVAS_PATH);
  revalidatePath(LINK_PATH);
  // El recordatorio importado vive en la otra herramienta.
  revalidatePath("/hub/clean-daily");
}

function toText(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/* -------------------------------------------------------------------------- */
/* La conexión                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Guarda el dominio y la llave, después de probarlos.
 *
 * El orden importa: primero se le pregunta a Canvas quién es el dueño de esa
 * llave y recién si contesta se guarda. Guardar primero y fallar después
 * dejaría a la persona con una conexión rota que dice estar bien.
 *
 * La llave que llega vacía en un formulario de edición significa "dejá la que
 * ya está", no "borrala": nadie va a copiar y pegar su token otra vez solo
 * para cambiar la ventana de semanas.
 */
export async function saveConnection(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await canvasClient();

  const baseUrl = normalizeBaseUrl(toText(formData.get("base_url"), 200));
  if (!baseUrl) {
    return {
      status: "error",
      error: "Escribí el dominio de tu Canvas, por ejemplo escuela.instructure.com.",
    };
  }

  const weeks = clampWeeks(Number(formData.get("weeks")));
  const typed = toText(formData.get("access_token"), 400);
  const existing = await loadCreds(supabase, user.id);
  const token = typed || existing?.token || "";

  if (token.length < 20) {
    return {
      status: "error",
      error: "Pegá la llave completa que generaste en Canvas.",
    };
  }

  const profile = await fetchProfile({ baseUrl, token });

  if (!profile.ok) {
    return { status: "error", error: FAILURE_MESSAGE[profile.kind] };
  }

  const { error } = await supabase.from("canvas_connections").upsert(
    {
      user_id: user.id,
      base_url: baseUrl,
      access_token: token,
      weeks,
      account_name: profile.data || null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0013?",
    };
  }

  // Con la llave recién puesta, traer los cursos es el paso obvio: sin esto
  // la pantalla siguiente estaría vacía y habría que tocar "sincronizar"
  // para ver lo que Canvas ya nos dijo hace un segundo.
  await syncCourses();

  refresh();
  return { status: "saved" };
}

/** Corta el vínculo. Las tareas ya importadas y sus borradores se quedan. */
export async function disconnect() {
  const { supabase, user } = await canvasClient();

  await supabase.from("canvas_connections").delete().eq("user_id", user.id);
  await supabase.from("canvas_courses").delete().eq("user_id", user.id);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Los cursos                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Vuelve a pedir el catálogo de cursos.
 *
 * Los que ya estaban conservan su `followed`: el upsert solo pisa nombre,
 * código y ciclo. Perder la selección en cada sincronización sería el peor
 * castigo posible por apretar un botón que dice "actualizar".
 */
export async function syncCourses(): Promise<FormState> {
  const { supabase, user } = await canvasClient();
  const creds = await loadCreds(supabase, user.id);

  if (!creds) return { status: "error", error: "Conectá tu Canvas primero." };

  const outcome = await fetchCourses(creds);
  if (!outcome.ok) {
    return { status: "error", error: FAILURE_MESSAGE[outcome.kind] };
  }

  if (outcome.data.length === 0) {
    return {
      status: "error",
      error: "Canvas no devolvió cursos activos para esta cuenta.",
    };
  }

  const { error } = await supabase.from("canvas_courses").upsert(
    outcome.data.map((course) => ({
      user_id: user.id,
      course_id: course.course_id,
      name: course.name,
      code: course.code,
      term: course.term,
      seen_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,course_id" }
  );

  if (error) {
    return { status: "error", error: "No se pudieron guardar los cursos." };
  }

  refresh();
  return { status: "saved" };
}

/** Prende o apaga un curso. Lo prendido es lo único que se mira. */
export async function toggleCourse(courseId: number, followed: boolean) {
  const { supabase, user } = await canvasClient();

  await supabase
    .from("canvas_courses")
    .update({ followed })
    .eq("user_id", user.id)
    .eq("course_id", courseId);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Lo que Canvas tiene pendiente                                               */
/* -------------------------------------------------------------------------- */

/**
 * Trae las tareas sin entregar de los cursos seguidos.
 *
 * Es una acción y no parte del render de la pantalla a propósito: son varias
 * llamadas a un servidor ajeno que a veces tarda cinco segundos. Abrir el
 * módulo tiene que ser instantáneo; ir a buscar novedades es un gesto.
 */
export async function fetchPendingAssignments(): Promise<PendingState> {
  const { supabase, user } = await canvasClient();

  const creds = await loadCreds(supabase, user.id);
  if (!creds) return { status: "error", error: "Conectá tu Canvas primero." };

  const { data: courseRows } = await supabase
    .from("canvas_courses")
    .select("course_id,name")
    .eq("user_id", user.id)
    .eq("followed", true);

  const courses = (courseRows ?? []) as { course_id: number; name: string }[];

  if (courses.length === 0) {
    return {
      status: "error",
      error: "Elegí al menos un curso para seguir.",
    };
  }

  const outcome = await fetchPending(creds, {
    courses,
    weeks: creds.weeks,
    now: new Date(),
  });

  if (!outcome.ok) {
    return { status: "error", error: FAILURE_MESSAGE[outcome.kind] };
  }

  await supabase
    .from("canvas_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", user.id);

  return { status: "ready", pending: outcome.data };
}

/* -------------------------------------------------------------------------- */
/* Importar                                                                    */
/* -------------------------------------------------------------------------- */

export type ImportState =
  | { status: "idle" }
  | { status: "done"; imported: number }
  | { status: "error"; error: string };

/** Lo que Clean Daily aguanta en una tarea. Más largo que esto, se corta. */
const TASK_TITLE_MAX = 120;
const TASK_NOTE_MAX = 300;

/**
 * Mete las tareas elegidas en la lista, y cada una como recordatorio en
 * Clean Daily.
 *
 * Son dos escrituras porque son dos cosas distintas: acá vive el enunciado
 * completo con el que después trabaja la IA; allá vive el "esto hay que
 * entregarlo el jueves" que aparece en la pantalla que la persona abre todos
 * los días. El `task_id` las une.
 *
 * Reimportar no duplica: la clave única (persona, tarea de Canvas) hace que
 * la segunda pasada actualice la fecha y las instrucciones, que es
 * exactamente lo que se quiere cuando el profesor cambió el enunciado.
 */
export async function importAssignments(
  rows: CanvasAssignment[]
): Promise<ImportState> {
  const { supabase, user } = await canvasClient();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: "error", error: "No elegiste ninguna tarea." };
  }

  const clean = rows.slice(0, 60).filter(
    (row) =>
      Number.isInteger(row?.assignment_id) &&
      Number.isInteger(row?.course_id) &&
      typeof row?.title === "string" &&
      row.title.trim().length > 0
  );

  if (clean.length === 0) {
    return { status: "error", error: "Las tareas llegaron incompletas." };
  }

  // Las que ya estaban conservan su recordatorio: si volvemos a crear uno,
  // la persona termina con la misma entrega dos veces en Clean Daily.
  const { data: known } = await supabase
    .from("canvas_assignments")
    .select("assignment_id,task_id")
    .eq("user_id", user.id)
    .in(
      "assignment_id",
      clean.map((row) => row.assignment_id)
    );

  const existingTask = new Map(
    ((known ?? []) as { assignment_id: number; task_id: string | null }[]).map(
      (row) => [row.assignment_id, row.task_id]
    )
  );

  const payload: Record<string, unknown>[] = [];

  for (const row of clean) {
    let taskId = existingTask.get(row.assignment_id) ?? null;

    if (!taskId) {
      const { data: task } = await supabase
        .from("clean_tasks")
        .insert({
          user_id: user.id,
          title: row.title.trim().slice(0, TASK_TITLE_MAX),
          note: `${row.course_name}${row.html_url ? ` · ${row.html_url}` : ""}`
            .trim()
            .slice(0, TASK_NOTE_MAX),
          due_at: row.due_at,
        })
        .select("id")
        .maybeSingle();

      taskId = (task as { id: string } | null)?.id ?? null;
    }

    payload.push({
      user_id: user.id,
      assignment_id: row.assignment_id,
      course_id: row.course_id,
      course_name: String(row.course_name ?? "").slice(0, 160) || "Curso",
      title: row.title.trim().slice(0, 200),
      instructions: row.instructions ? row.instructions.slice(0, 12_000) : null,
      html_url: row.html_url ?? null,
      due_at: row.due_at,
      points: row.points,
      task_id: taskId,
    });
  }

  const { error } = await supabase
    .from("canvas_assignments")
    .upsert(payload, { onConflict: "user_id,assignment_id" });

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0013?",
    };
  }

  refresh();
  return { status: "done", imported: payload.length };
}

/**
 * Saca una tarea de la lista.
 *
 * El recordatorio de Clean Daily se va con ella: se creó desde acá y quedaría
 * huérfano, sin forma de saber de dónde salió. Los borradores caen por la
 * cascada de la migración — están atados a la tarea, no a la persona.
 */
export async function removeAssignment(id: string) {
  const { supabase, user } = await canvasClient();

  const { data } = await supabase
    .from("canvas_assignments")
    .select("task_id")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  const taskId = (data as { task_id: string | null } | null)?.task_id;

  if (taskId) {
    await supabase
      .from("clean_tasks")
      .delete()
      .eq("user_id", user.id)
      .eq("id", taskId);
  }

  await supabase
    .from("canvas_assignments")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  refresh();
}
