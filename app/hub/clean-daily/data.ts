import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { minutesIn, TIMEZONE, todayIn } from "@/lib/cron";
import type { Habit, HabitLog, Task } from "@/lib/habits";
import { createClient } from "@/lib/supabase/server";

export const CLEAN_PATH = "/hub/clean-daily";
export const HABITS_PATH = `${CLEAN_PATH}/habitos`;
export const RHYTHM_PATH = `${CLEAN_PATH}/ritmo`;

/**
 * Qué día es hoy para esta persona.
 *
 * El reinicio de medianoche es la promesa central del módulo, así que no
 * puede depender de en qué continente esté el servidor: se resuelve en la
 * zona del bolsillo, la misma que ya usan los cron de salarios.
 */
export function today() {
  return todayIn(TIMEZONE);
}

/**
 * Qué hora es, en minutos desde medianoche y en la misma zona.
 *
 * La pantalla necesita saberlo para decir cuál hábito es "ahora", y esa
 * cuenta tiene que salir del servidor: si la hiciera el cliente, el HTML del
 * servidor y el del navegador no coincidirían y React tiraría un error de
 * hidratación en cada carga.
 */
export function clock() {
  return minutesIn(TIMEZONE);
}

/**
 * El cliente y la persona, sin salir a la red.
 *
 * La sesión ya la verificó el proxy en esta misma petición, así que esto
 * permite disparar todas las consultas de la pantalla en paralelo en vez de
 * encadenarlas detrás de la identidad.
 */
export async function cleanClient() {
  const user = await currentUser();
  if (!user) redirect("/");

  return { supabase: await createClient("lifestyle_utilities"), user };
}

type Client = Awaited<ReturnType<typeof createClient>>;

export const HABIT_COLUMNS =
  "id,name,polarity,freq,weekdays,interval_days,anchor_date,unit_label,active,sort_order,cue,reward,start_time,end_time,remind";

/** Todos los hábitos, activos y archivados: la pantalla decide cuáles muestra. */
export async function loadHabits(client: Client, userId: string) {
  const { data } = await client
    .from("clean_habits")
    .select(HABIT_COLUMNS)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []) as Habit[];
}

/**
 * Los registros de un tramo de días.
 *
 * Se piden por rango y no por hábito: la pantalla de hoy y la del mes usan la
 * misma consulta, y cruzar hábito con día es trabajo de `lib/habits`.
 */
export async function loadLogs(
  client: Client,
  userId: string,
  from: string,
  to: string
) {
  const { data } = await client
    .from("clean_habit_logs")
    .select("habit_id,done_on,times")
    .eq("user_id", userId)
    .gte("done_on", from)
    .lte("done_on", to);

  return (data ?? []) as HabitLog[];
}

const TASK_COLUMNS = "id,title,note,due_at,done_at,created_at";

/**
 * Las tareas abiertas, más las cerradas hace poco.
 *
 * Las hechas viejas no vuelven a la pantalla: la lista de arriba es para lo
 * que falta, y un historial infinito la convertiría en otra cosa.
 */
export async function loadTasks(client: Client, userId: string, doneLimit = 6) {
  const [open, done] = await Promise.all([
    client
      .from("clean_tasks")
      .select(TASK_COLUMNS)
      .eq("user_id", userId)
      .is("done_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    client
      .from("clean_tasks")
      .select(TASK_COLUMNS)
      .eq("user_id", userId)
      .not("done_at", "is", null)
      .order("done_at", { ascending: false })
      .limit(doneLimit),
  ]);

  return {
    open: (open.data ?? []) as Task[],
    done: (done.data ?? []) as Task[],
  };
}
