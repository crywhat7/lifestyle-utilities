"use server";

import { revalidatePath } from "next/cache";
import { hhmm, resolveDay, type HabitFreq, type Polarity } from "@/lib/habits";
import { habitPayload } from "@/lib/notifications";
import { sendPush, type PushSubscriptionRow } from "@/lib/push";
import { CLEAN_PATH, HABITS_PATH, RHYTHM_PATH, cleanClient, today } from "./data";

export type FormState = { status: "idle" | "saved" | "error"; error?: string };

function refresh() {
  revalidatePath(CLEAN_PATH);
  revalidatePath(HABITS_PATH);
  revalidatePath(RHYTHM_PATH);
}

function toText(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/* -------------------------------------------------------------------------- */
/* El toque diario                                                             */
/* -------------------------------------------------------------------------- */

/**
 * El día sobre el que va a escribir esta acción.
 *
 * El cliente puede pedir un día anterior —la pantalla del recuerdo—, pero la
 * palabra final la tiene el servidor: `resolveDay` no deja pasar el futuro
 * ni nada más viejo que el piso de la semana, y cualquier valor torcido cae
 * en hoy. Con esto, mandar un `done_on` inventado desde la consola no
 * alcanza para reescribir el mes pasado.
 */
function writableDay(day?: string) {
  return resolveDay(day, today());
}

/**
 * Marcar o desmarcar un hábito.
 *
 * Sin `day` es hoy, que es el 99% de los toques. Con `day` es un día que ya
 * cerró y que la persona abrió a propósito: olvidarse de ABRIR la app no es
 * lo mismo que no haber hecho el hábito, y obligar a que el registro mienta
 * por eso vuelve ruido al porcentaje del mes.
 *
 * Lo que sigue sin existir es la deuda: ningún día pasado aparece solo
 * pidiendo que lo completen — hay que ir a buscarlo.
 *
 * Desmarcar borra la fila, no la deja en falso: la ausencia es el estado
 * limpio.
 */
export async function markHabit(habitId: string, done: boolean, day?: string) {
  const { supabase, user } = await cleanClient();
  const on = writableDay(day);

  if (done) {
    await supabase.from("clean_habit_logs").upsert(
      { user_id: user.id, habit_id: habitId, done_on: on, times: 1 },
      { onConflict: "habit_id,done_on", ignoreDuplicates: true }
    );
  } else {
    await supabase
      .from("clean_habit_logs")
      .delete()
      .eq("user_id", user.id)
      .eq("habit_id", habitId)
      .eq("done_on", on);
  }

  refresh();
}

/**
 * Sumar o restar una caída del día — la cuenta de los hábitos malos.
 *
 * Dos coca-colas no son una, y ese es justamente el número que la persona
 * quiere ver bajar. Al llegar a cero se borra la fila: el día vuelve a estar
 * limpio, sin dejar un registro de "cero veces" que ensucie las métricas.
 */
export async function bumpHabit(habitId: string, delta: number, day?: string) {
  const { supabase, user } = await cleanClient();
  const on = writableDay(day);

  const { data: current } = await supabase
    .from("clean_habit_logs")
    .select("times")
    .eq("user_id", user.id)
    .eq("habit_id", habitId)
    .eq("done_on", on)
    .maybeSingle();

  const next = Math.min(99, (current?.times ?? 0) + delta);

  if (next <= 0) {
    await supabase
      .from("clean_habit_logs")
      .delete()
      .eq("user_id", user.id)
      .eq("habit_id", habitId)
      .eq("done_on", on);
  } else {
    await supabase.from("clean_habit_logs").upsert(
      { user_id: user.id, habit_id: habitId, done_on: on, times: next },
      { onConflict: "habit_id,done_on" }
    );
  }

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Los hábitos                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Lee la regla del formulario y la deja consistente.
 *
 * Lo que la frecuencia elegida no usa se guarda en nulo: un hábito semanal
 * que arrastre el "cada 3 días" de cuando era intervalo es una bomba de
 * tiempo el día que alguien lea esa columna sin mirar `freq`.
 */
function toRule(formData: FormData) {
  const raw = String(formData.get("freq") ?? "daily");
  const freq: HabitFreq =
    raw === "weekdays" || raw === "interval" ? raw : "daily";

  if (freq === "weekdays") {
    const weekdays = formData
      .getAll("weekdays")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

    if (weekdays.length === 0) {
      return { error: "Elegí al menos un día de la semana." } as const;
    }

    return {
      freq,
      weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
      interval_days: null,
    };
  }

  if (freq === "interval") {
    const every = toNumber(formData.get("interval_days"));
    if (every == null || every < 2 || every > 60) {
      return { error: "El intervalo va de 2 a 60 días." } as const;
    }

    return { freq, weekdays: null, interval_days: Math.round(every) };
  }

  return { freq, weekdays: null, interval_days: null };
}

/**
 * Una hora del formulario, normalizada a "HH:MM" o a nulo.
 *
 * El `<input type="time">` manda "" cuando está vacío y "07:00" cuando no.
 * Todo lo que no calce con eso se descarta en vez de llegar a Postgres y
 * reventar la fila entera por un campo opcional.
 */
function toTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

export async function saveHabit(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await cleanClient();

  const id = toText(formData.get("id"), 40);
  const name = toText(formData.get("name"), 60);
  if (!name) return { status: "error", error: "Ponele un nombre." };

  const polarity: Polarity =
    String(formData.get("polarity")) === "bad" ? "bad" : "good";

  // Se valida más abajo, y solo si el hábito no va encadenado: en ese caso su
  // regla propia no se usa y rechazar el formulario por ella sería absurdo.
  const rule = toRule(formData);

  // La unidad solo tiene sentido en lo que se cuenta hacia abajo.
  const unit = polarity === "bad" ? toText(formData.get("unit_label"), 20) : "";

  const startTime = toTime(formData.get("start_time"));
  const endTime = toTime(formData.get("end_time"));

  /*
    Una ventana sin principio no es una ventana, y una que cierra antes de
    abrir no llega nunca. Se avisa en vez de guardar algo que el check de la
    base rechazaría con un error que no dice nada.
  */
  if (endTime && !startTime) {
    return { status: "error", error: "Poné la hora de inicio antes del cierre." };
  }

  if (startTime && endTime && endTime <= startTime) {
    return { status: "error", error: "El cierre tiene que ser después del inicio." };
  }

  /*
    La acumulación: «después de X, voy a Y».

    Que el select no ofrezca opciones inválidas no alcanza —una Server Action
    se alcanza por POST directo—, así que la cadena se recorre acá antes de
    guardar. Un círculo (A después de B, B después de A) no lo puede ver el
    CHECK de la base, que solo mira una fila, y dejaría la pantalla girando
    para siempre al dibujar la cadena.
  */
  const afterId = toText(formData.get("after_habit_id"), 40) || null;

  if (afterId) {
    const { data: links } = await supabase
      .from("clean_habits")
      .select("id,after_habit_id")
      .eq("user_id", user.id);

    const parents = new Map(
      (links ?? []).map((row) => [String(row.id), row.after_habit_id as string | null])
    );

    if (!parents.has(afterId)) {
      return { status: "error", error: "Ese hábito no existe." };
    }

    if (id) {
      // Subir desde el padre elegido: si se llega a este mismo hábito, la
      // cadena se muerde la cola.
      const seen = new Set<string>();
      let cursor: string | null = afterId;

      while (cursor && !seen.has(cursor)) {
        if (cursor === id) {
          return {
            status: "error",
            error: "Eso armaría un círculo: ese hábito ya va después de este.",
          };
        }
        seen.add(cursor);
        cursor = parents.get(cursor) ?? null;
      }
    }
  }

  /*
    Encadenado no hay regla propia que guardar: el calendario es el del padre
    y `occursOn` ni siquiera mira estas columnas. Dejar la vieja adentro sería
    dejar una bomba para el día que alguien desencadene el hábito y se
    encuentre con una frecuencia que no eligió.
  */
  if (!afterId && "error" in rule) {
    return { status: "error", error: rule.error };
  }

  const schedule =
    afterId || "error" in rule
      ? { freq: "daily" as const, weekdays: null, interval_days: null }
      : rule;

  const payload = {
    user_id: user.id,
    name,
    polarity,
    ...schedule,
    unit_label: unit || null,
    after_habit_id: afterId,
    // Encadenado, el hábito anterior ES la señal: guardar además un texto
    // libre dejaría dos disparadores compitiendo y una frase contradictoria.
    cue: afterId ? null : toText(formData.get("cue"), 80) || null,
    place: toText(formData.get("place"), 60) || null,
    reward: toText(formData.get("reward"), 80) || null,
    start_time: startTime,
    end_time: endTime,
    // Sin hora no hay cuándo avisar: el recordatorio se apaga solo.
    remind: startTime ? formData.get("remind") === "on" : false,
    active: true,
  };

  const { error } = id
    ? await supabase
        .from("clean_habits")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("clean_habits").insert({
        ...payload,
        // El ancla es hoy: un hábito nuevo no arrastra el mes que no existió.
        anchor_date: today(),
      });

  if (error) return { status: "error", error: "No se pudo guardar." };

  refresh();
  return { status: "saved" };
}

/** Pausar sin perder el historial: el hábito deja de aparecer, los días quedan. */
export async function setHabitActive(habitId: string, active: boolean) {
  const { supabase, user } = await cleanClient();

  await supabase
    .from("clean_habits")
    .update({ active })
    .eq("id", habitId)
    .eq("user_id", user.id);

  refresh();
}

/** Borrar de verdad: se lleva los registros por la cascada de la migración. */
export async function deleteHabit(habitId: string) {
  const { supabase, user } = await cleanClient();

  await supabase
    .from("clean_habits")
    .delete()
    .eq("id", habitId)
    .eq("user_id", user.id);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Las tareas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * El `datetime-local` llega sin zona ("2026-09-04T18:30").
 *
 * `new Date` lo interpreta en la zona de quien lo escribió, que es
 * exactamente lo que se quiso decir: las 18:30 de su reloj.
 */
function toDueDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function saveTask(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await cleanClient();

  const id = toText(formData.get("id"), 40);
  const title = toText(formData.get("title"), 120);
  if (!title) return { status: "error", error: "Escribí qué hay que hacer." };

  const payload = {
    user_id: user.id,
    title,
    note: toText(formData.get("note"), 300) || null,
    due_at: toDueDate(formData.get("due_at")),
  };

  const { error } = id
    ? await supabase
        .from("clean_tasks")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
    : await supabase.from("clean_tasks").insert(payload);

  if (error) return { status: "error", error: "No se pudo guardar." };

  refresh();
  return { status: "saved" };
}

/** Una tarea no muere hasta que se marca; y se puede resucitar. */
export async function toggleTask(taskId: string, done: boolean) {
  const { supabase, user } = await cleanClient();

  await supabase
    .from("clean_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("user_id", user.id);

  refresh();
}

export async function deleteTask(taskId: string) {
  const { supabase, user } = await cleanClient();

  await supabase
    .from("clean_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", user.id);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Avisos push                                                                 */
/* -------------------------------------------------------------------------- */

/*
   La tabla de suscripciones es una sola para toda la cuenta —la creó My
   Pocket en la migración 0003— y eso está bien: el permiso es del navegador,
   no de la herramienta. Lo que no puede pasar es obligar a alguien que solo
   usa Clean Daily a irse a los ajustes de la otra app para encender su
   propio recordatorio, así que el módulo tiene su propia puerta a la misma
   tabla.
*/

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}): Promise<FormState> {
  const { supabase, user } = await cleanClient();

  const endpoint = String(input.endpoint ?? "").trim();
  const p256dh = String(input.p256dh ?? "").trim();
  const auth = String(input.auth ?? "").trim();

  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return {
      status: "error",
      error: "El navegador no devolvió una suscripción válida.",
    };
  }

  const { error } = await supabase.from("pocket_push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      label: String(input.label ?? "").slice(0, 60) || null,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0003?",
    };
  }

  return { status: "saved" };
}

export async function deletePushSubscription(endpoint: string) {
  const { supabase, user } = await cleanClient();

  await supabase
    .from("pocket_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
}

/**
 * Un aviso de prueba con el texto real de un hábito propio.
 *
 * Con un hábito de verdad adentro, la prueba muestra exactamente lo que va a
 * llegar a las 07:00 —señal y resultado incluidos— en vez de un "hola" que no
 * prueba que el texto esté bien armado.
 */
export async function sendHabitTestPush(): Promise<FormState> {
  const { supabase, user } = await cleanClient();

  const [devices, habits] = await Promise.all([
    supabase
      .from("pocket_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", user.id),
    supabase
      .from("clean_habits")
      .select("name,polarity,cue,reward,place,start_time,end_time")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("start_time", { ascending: true, nullsFirst: false })
      .limit(1),
  ]);

  const subscriptions = (devices.data ?? []) as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    return {
      status: "error",
      error: "Todavía no hay ningún dispositivo conectado.",
    };
  }

  const sample = habits.data?.[0];
  const payload = habitPayload([
    {
      name: sample?.name ?? "Caminar 30 minutos",
      polarity: sample?.polarity === "bad" ? "bad" : "good",
      cue: sample?.cue ?? "termine de desayunar",
      reward: sample?.reward ?? "arrancar el día despierto",
      place: sample?.place ?? "la cocina",
      time: hhmm(sample?.start_time) ?? "07:00",
      endTime: hhmm(sample?.end_time),
      kind: "start",
    },
  ]);

  const result = await sendPush(subscriptions, payload);

  if (result.sent === 0) {
    return {
      status: "error",
      error: result.errors[0] ?? "No se pudo entregar el aviso.",
    };
  }

  return { status: "saved" };
}
