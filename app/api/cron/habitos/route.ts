import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron, minutesIn, todayIn, TIMEZONE } from "@/lib/cron";
import {
  hhmm,
  nudgeKind,
  occursOn,
  type Habit,
  type NudgeKind,
} from "@/lib/habits";
import { habitPayload, type HabitNudge } from "@/lib/notifications";
import {
  dropSubscriptions,
  sendPush,
  type PushSubscriptionRow,
} from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El recordatorio de los hábitos — pensado para correr cada 15 minutos desde
 * cron-job.org.
 *
 * La idea del libro es que la señal sea obvia. Un hábito escrito en una app
 * que hay que acordarse de abrir no es una señal obvia: es otra cosa más para
 * recordar. Esto lo invierte — el teléfono dice la señal a la hora que la
 * persona eligió, y el aviso lleva directo a marcarlo.
 *
 * Cada corrida cubre solo la franja de minutos desde la corrida anterior
 * (`window`, 15 por defecto), así que un hábito de las 07:07 lo agarra la
 * pasada de las 07:15 y ninguna otra. Que no se repita no lo garantiza el
 * reloj sino `clean_habit_nudges`: la fila se reclama con un upsert que
 * ignora duplicados, y solo quien la insertó de verdad manda el push. Dos
 * corridas superpuestas no pueden avisar dos veces lo mismo.
 *
 * Nunca avisa de algo ya hecho: lo marcado hoy se descuenta antes de armar
 * el texto. Un recordatorio de lo que acabás de hacer es la forma más rápida
 * de que alguien apague las notificaciones para siempre.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Minutos que cubre cada corrida.
 *
 * Debería igualar al intervalo del cron, pero de más nunca hace daño: los
 * minutos cubiertos dos veces los absorbe el candado de `clean_habit_nudges`,
 * y esa superposición es justamente lo que salva a un hábito cuando una
 * corrida se pierde. De menos sí: lo que caiga en el hueco no se avisa nunca.
 */
const DEFAULT_WINDOW = 15;

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dry = params.get("dry") === "1";

  const span = Number(params.get("window"));
  const width =
    Number.isFinite(span) && span >= 1 && span <= 120 ? Math.round(span) : DEFAULT_WINDOW;

  // `at` fuerza una hora ("07:00") para poder probar el aviso de las siete a
  // las tres de la tarde. Solo se usa a mano; el cron nunca lo manda.
  const forced = hhmm(params.get("at"));
  const now = forced
    ? Number(forced.slice(0, 2)) * 60 + Number(forced.slice(3))
    : minutesIn(TIMEZONE);

  const today = todayIn(TIMEZONE);
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("pocket_push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron leer las suscripciones.", detail: error.message },
      { status: 500 }
    );
  }

  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const row of rows ?? []) {
    const userId = String(row.user_id);
    const list = byUser.get(userId) ?? [];
    list.push(row as PushSubscriptionRow);
    byUser.set(userId, list);
  }

  const base = {
    ok: true,
    dry,
    date: today,
    clock: `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(
      now % 60
    ).padStart(2, "0")}`,
    timezone: TIMEZONE,
    window: width,
  };

  // Sin un solo dispositivo conectado no hay nada que hacer, y ni siquiera
  // vale la pena leer los hábitos.
  if (byUser.size === 0) {
    return NextResponse.json({ ...base, users: 0, pushed: 0 });
  }

  const userIds = [...byUser.keys()];

  /*
    Se piden todos los activos y no solo los que avisan: un hábito encadenado
    no tiene texto de señal, tiene un hábito anterior, y para escribir
    «Después de estudiar» hace falta tener también al padre a mano aunque él
    no genere ningún aviso. Son unas pocas filas por persona.
  */
  const { data: habitRows, error: habitError } = await supabase
    .from("clean_habits")
    .select(
      "id,user_id,name,polarity,freq,weekdays,interval_days,anchor_date,unit_label,active,sort_order,cue,reward,place,start_time,end_time,remind,after_habit_id"
    )
    .eq("active", true)
    .in("user_id", userIds);

  /*
    Sin esto, un módulo cuyas migraciones no se corrieron devolvía "ok, cero
    avisos" para siempre y no había forma de notarlo desde cron-job.org: la
    corrida figuraba en verde. Un trabajo que no puede hacer su trabajo tiene
    que fallar ruidosamente.
  */
  if (habitError) {
    return NextResponse.json(
      {
        error:
          "No se pudieron leer los hábitos. ¿Corriste todas las migraciones de Clean Daily (0008 a 0011)?",
        detail: habitError.message,
      },
      { status: 500 }
    );
  }

  /*
    Qué toca hoy lo decide `occursOn`, la misma función que dibuja la pantalla.
    El aviso y lo que la persona ve al abrir la app salen de la misma regla:
    si alguna vez difieren, es un bug en un solo lugar.
  */
  const all = (habitRows ?? []).map((row) => ({
    ...row,
    start_time: hhmm(row.start_time as string),
  }));

  /** Para poder nombrar al hábito anterior en el texto del aviso. */
  const nameById = new Map(all.map((row) => [String(row.id), String(row.name)]));

  /*
    El mismo mapa que usa la pantalla, para que `occursOn` pueda heredar el
    calendario del padre. Sin esto el cron avisaría de un hábito encadenado un
    día que su disparador no ocurre — justo lo que la lista de hoy no muestra.
  */
  const byId = new Map(
    all.map((row) => [String(row.id), row as unknown as Habit])
  );

  // Solo avisa lo que tiene hora propia y el aviso encendido. Un hábito
  // encadenado sin hora no recibe push: su señal es terminar el anterior, y
  // el teléfono no tiene forma de saber cuándo pasó eso.
  const scheduled = all
    .filter((row) => row.remind && row.start_time)
    .filter((row) => occursOn(row as unknown as Habit, today, byId));

  if (scheduled.length === 0) {
    return NextResponse.json({ ...base, users: byUser.size, pushed: 0 });
  }

  // Lo ya marcado hoy no se recuerda.
  const { data: logs } = await supabase
    .from("clean_habit_logs")
    .select("habit_id")
    .eq("done_on", today)
    .in(
      "habit_id",
      scheduled.map((row) => String(row.id))
    );

  const done = new Set((logs ?? []).map((row) => String(row.habit_id)));

  type Candidate = { row: (typeof scheduled)[number]; kind: NudgeKind };
  const candidates: Candidate[] = [];

  /*
    Qué avisar lo decide `nudgeKind`, que es pura y está probada contra un
    reloj inventado. Acá solo se recorre: lo ya marcado hoy no se recuerda.
  */
  for (const row of scheduled) {
    if (done.has(String(row.id))) continue;

    const kind = nudgeKind(row as unknown as Habit, now, width);
    if (kind) candidates.push({ row, kind });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ...base, users: byUser.size, pushed: 0 });
  }

  const preview = candidates.map(({ row, kind }) => ({
    userId: String(row.user_id),
    habit: String(row.name),
    at: hhmm(row.start_time as string),
    kind,
  }));

  if (dry) {
    return NextResponse.json({
      ...base,
      users: byUser.size,
      pushed: 0,
      candidates: preview,
    });
  }

  /*
    El candado. El upsert reclama la fila de cada aviso y `.select()` devuelve
    únicamente las que insertó esta corrida: las que ya existían no vuelven, y
    por eso no se manda dos veces el mismo empujón aunque el cron se dispare
    dos veces por minuto o corran dos servidores en paralelo.
  */
  const { data: claimed, error: claimError } = await supabase
    .from("clean_habit_nudges")
    .upsert(
      candidates.map(({ row, kind }) => ({
        user_id: String(row.user_id),
        habit_id: String(row.id),
        sent_on: today,
        kind,
      })),
      { onConflict: "habit_id,sent_on,kind", ignoreDuplicates: true }
    )
    .select("habit_id,kind");

  if (claimError) {
    return NextResponse.json(
      {
        error: "No se pudo registrar el aviso. ¿Corriste la migración 0009?",
        detail: claimError.message,
      },
      { status: 500 }
    );
  }

  const fresh = new Set(
    (claimed ?? []).map((row) => `${row.habit_id}:${row.kind}`)
  );

  // Un aviso por persona aunque tenga tres hábitos a la misma hora: tres
  // globos a las siete de la mañana se apagan de una sola vez y para siempre.
  const linesByUser = new Map<string, HabitNudge[]>();

  for (const { row, kind } of candidates) {
    if (!fresh.has(`${row.id}:${kind}`)) continue;

    const userId = String(row.user_id);
    const lines = linesByUser.get(userId) ?? [];

    const parent = row.after_habit_id
      ? nameById.get(String(row.after_habit_id))
      : null;

    lines.push({
      name: String(row.name),
      polarity: row.polarity === "bad" ? "bad" : "good",
      // Encadenado, la señal es el hábito anterior. Es la misma frase que se
      // ve en la pantalla, así que el aviso no dice una cosa y la app otra.
      cue: parent
        ? `después de ${parent.toLowerCase()}`
        : ((row.cue as string | null) ?? null),
      place: (row.place as string | null) ?? null,
      reward: (row.reward as string | null) ?? null,
      time: hhmm(row.start_time as string),
      endTime: hhmm(row.end_time as string),
      kind,
    });

    linesByUser.set(userId, lines);
  }

  const errors: string[] = [];
  let pushed = 0;

  for (const [userId, lines] of linesByUser) {
    const subscriptions = byUser.get(userId);
    if (!subscriptions || subscriptions.length === 0) continue;

    const result = await sendPush(subscriptions, habitPayload(lines));
    await dropSubscriptions(supabase, result.gone);
    errors.push(...result.errors);
    pushed += result.sent;
  }

  return NextResponse.json({
    ...base,
    users: linesByUser.size,
    pushed,
    nudges: preview.filter((line, index) =>
      fresh.has(`${candidates[index].row.id}:${line.kind}`)
    ),
    ...(errors.length > 0 ? { errors } : {}),
  });
}
