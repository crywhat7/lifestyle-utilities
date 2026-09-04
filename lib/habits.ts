/**
 * Clean Daily — tipos y aritmética de la pizarra limpia.
 *
 * Nada de esto toca la red ni la base: son las reglas que comparten el
 * servidor y el cliente para ponerse de acuerdo en qué día es hoy, qué toca
 * hoy y qué tan seguido pasó este mes.
 *
 * La idea que sostiene todo el módulo: un hábito NO tiene estado pendiente.
 * Existe la regla y existen los días en que se registró. "Ayer no lo hice"
 * no es una fila en ningún lado, es la ausencia de una fila — y por eso a
 * las 00:00 la lista aparece limpia sin que corra ningún proceso.
 */

/** Bueno = quiero hacerlo. Malo = quiero contarlo para poder bajarlo. */
export type Polarity = "good" | "bad";

/**
 * Cada cuánto aparece un hábito.
 *
 *   daily     — todos los días.
 *   weekdays  — solo los días marcados (0 = domingo, como `Date.getDay()`).
 *   interval  — cada N días contando desde `anchor_date`.
 */
export type HabitFreq = "daily" | "weekdays" | "interval";

export type Habit = {
  id: string;
  name: string;
  polarity: Polarity;
  freq: HabitFreq;
  /** 0 = domingo. Solo manda cuando `freq === "weekdays"`. */
  weekdays: number[] | null;
  /** Solo manda cuando `freq === "interval"`. */
  interval_days: number | null;
  /** Día cero del intervalo y piso de las métricas: antes de esto no existía. */
  anchor_date: string;
  /**
   * Las otras tres patas del ciclo.
   *
   * El hábito por sí solo es la respuesta. Sin la señal que lo dispara y sin
   * el resultado que lo cierra, queda como una nota suelta que hay que
   * acordarse de mirar — que es exactamente lo que el libro dice que no
   * funciona. `start_time` es lo que convierte el deseo en una cita.
   */
  cue: string | null;
  reward: string | null;
  /** Dónde pasa. La tercera pata de «lo haré a tal hora en tal lugar». */
  place: string | null;
  /** "HH:MM" en la zona del bolsillo. Nulo = en cualquier momento del día. */
  start_time: string | null;
  /** Fin de la ventana. Nulo = momento puntual, sin última llamada. */
  end_time: string | null;
  /** Si el teléfono lo dice en voz alta cuando llegue la hora. */
  remind: boolean;
  /**
   * El hábito que lo dispara — la acumulación del libro.
   *
   * Cuando está puesto, ES la señal y `cue` no se usa: un hábito tiene una
   * señal, no dos. Es la más confiable que existe porque el hábito anterior
   * ya pasa todos los días sin que nadie tenga que acordarse.
   */
  after_habit_id: string | null;
  /** Qué se cuenta en un hábito malo: "vasos", "panes". Nulo = veces. */
  unit_label: string | null;
  active: boolean;
  sort_order: number;
};

/** Un día registrado. Que no exista la fila es el "no pasó". */
export type HabitLog = {
  habit_id: string;
  done_on: string;
  times: number;
};

export type Task = {
  id: string;
  title: string;
  note: string | null;
  /** Nulo = pendiente sin fecha, que es un estado válido y no un olvido. */
  due_at: string | null;
  done_at: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/* Fechas — siempre en local, nunca en UTC                                     */
/* -------------------------------------------------------------------------- */

/** YYYY-MM-DD de una fecha local, sin que UTC corra el día. */
export function isoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Un YYYY-MM-DD de vuelta a Date, al mediodía local.
 *
 * `new Date("2026-03-01")` se parsea como UTC y en América amanece el 28 de
 * febrero. El mediodía deja doce horas de colchón para cualquier huso.
 */
export function fromIsoDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

/** Días enteros entre dos YYYY-MM-DD. Positivo si `b` es posterior. */
export function daysBetween(a: string, b: string) {
  const ms = fromIsoDay(b).getTime() - fromIsoDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(iso: string, amount: number) {
  const date = fromIsoDay(iso);
  date.setDate(date.getDate() + amount);
  return isoDay(date);
}

export const WEEKDAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"] as const;

export const WEEKDAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

/** "jueves 4 de septiembre", para el encabezado del día. */
export function longDayLabel(iso: string) {
  return fromIsoDay(iso).toLocaleDateString("es-GT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function monthLabel(iso: string) {
  return fromIsoDay(iso).toLocaleDateString("es-GT", {
    month: "long",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* El motor: qué toca hoy                                                      */
/* -------------------------------------------------------------------------- */

/**
 * ¿Este hábito aparece este día?
 *
 * Antes del `anchor_date` la respuesta es siempre no: un hábito creado hoy no
 * puede haberse fallado la semana pasada, y las métricas se apoyan en esto
 * para no arrancar con un porcentaje deprimente que nadie se ganó.
 *
 * Encadenado, el calendario es el del padre y su propia frecuencia no se
 * mira. «Después de estudiar» no quiere decir nada un día que no estudiás:
 * si el disparador no pasa, el hábito tampoco. Pasar `byId` es lo que activa
 * esa herencia — sin el mapa no hay cómo mirar hacia arriba, y cada hábito
 * responde por su propia regla.
 */
export function occursOn(
  habit: Habit,
  iso: string,
  byId?: Map<string, Habit>,
  seen = new Set<string>()
): boolean {
  if (iso < habit.anchor_date) return false;

  if (habit.after_habit_id && byId && !seen.has(habit.id)) {
    const parent = byId.get(habit.after_habit_id);
    if (parent) {
      seen.add(habit.id);
      return occursOn(parent, iso, byId, seen);
    }
  }

  if (habit.freq === "weekdays") {
    const weekday = fromIsoDay(iso).getDay();
    return (habit.weekdays ?? []).includes(weekday);
  }

  if (habit.freq === "interval") {
    const every = habit.interval_days ?? 1;
    if (every < 1) return true;
    return daysBetween(habit.anchor_date, iso) % every === 0;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* La cadena: acumulación de hábitos                                           */
/* -------------------------------------------------------------------------- */

export function indexById(habits: Habit[]) {
  return new Map(habits.map((habit) => [habit.id, habit]));
}

/**
 * A qué hora cae de verdad, siguiendo la cadena hacia arriba.
 *
 * Un hábito encadenado normalmente no tiene hora propia —pasa cuando termina
 * el anterior—, así que sin esto caería al fondo de la lista, lejos del
 * hábito que lo dispara. Hereda la del padre y la cadena se mantiene junta.
 *
 * `seen` corta cualquier círculo que se haya colado en los datos: `saveHabit`
 * no deja crearlos, pero una fila editada a mano en Supabase colgaría la
 * pantalla, y eso no puede pasar por leer.
 */
export function effectiveStart(
  habit: Habit,
  byId: Map<string, Habit>,
  seen = new Set<string>()
): number | null {
  const own = startMinutes(habit);
  if (own != null) return own;

  if (!habit.after_habit_id || seen.has(habit.id)) return null;
  seen.add(habit.id);

  const parent = byId.get(habit.after_habit_id);
  return parent ? effectiveStart(parent, byId, seen) : null;
}

/** Todo lo que cuelga de un hábito, para no ofrecerlo como su propio padre. */
export function descendantsOf(habits: Habit[], id: string) {
  const out = new Set<string>();
  const pending = [id];

  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const habit of habits) {
      if (habit.after_habit_id === current && !out.has(habit.id)) {
        out.add(habit.id);
        pending.push(habit.id);
      }
    }
  }

  return out;
}

export type ChainRow = {
  habit: Habit;
  /** 0 = arranca la cadena. 1+ = cuelga del de arriba. */
  depth: number;
  /** El hábito que lo dispara, si está en esta misma lista. */
  after: Habit | null;
  /** La hora que le toca, propia o heredada. Nula = en cualquier momento. */
  startsAt: number | null;
};

/**
 * La lista en el orden en que va a pasar el día, con las cadenas armadas.
 *
 * Cada hijo se dibuja pegado a su padre en vez de en su propio lugar por
 * hora: la cadena es una sola rutina —«después de estudiar, cepillarme los
 * dientes»— y partirla en dos filas separadas es perder justamente lo que la
 * hace funcionar.
 *
 * Un hábito cuyo padre no está en esta lista —porque hoy no toca, o está en
 * pausa, o es de la otra polaridad— arranca cadena él mismo. No desaparece
 * por depender de algo que hoy no existe.
 */
export function chainOrder(habits: Habit[]): ChainRow[] {
  const byId = indexById(habits);

  const children = new Map<string, Habit[]>();
  const roots: Habit[] = [];

  for (const habit of habits) {
    const parentId = habit.after_habit_id;
    if (parentId && byId.has(parentId)) {
      children.set(parentId, [...(children.get(parentId) ?? []), habit]);
    } else {
      roots.push(habit);
    }
  }

  const bySortOrder = (a: Habit, b: Habit) =>
    a.sort_order !== b.sort_order
      ? a.sort_order - b.sort_order
      : a.name.localeCompare(b.name, "es");

  roots.sort((a, b) => {
    const at = effectiveStart(a, byId) ?? MINUTES_IN_DAY;
    const bt = effectiveStart(b, byId) ?? MINUTES_IN_DAY;
    return at !== bt ? at - bt : bySortOrder(a, b);
  });

  const out: ChainRow[] = [];
  const visited = new Set<string>();

  const walk = (habit: Habit, depth: number, after: Habit | null) => {
    // El mismo seguro que `effectiveStart`: leer datos torcidos no puede
    // colgar la pantalla.
    if (visited.has(habit.id)) return;
    visited.add(habit.id);

    out.push({
      habit,
      depth,
      after,
      startsAt: effectiveStart(habit, byId),
    });

    for (const child of (children.get(habit.id) ?? []).sort(bySortOrder)) {
      walk(child, depth + 1, habit);
    }
  };

  for (const root of roots) walk(root, 0, null);

  /*
    Lo que quedó sin dibujar está en un círculo: cada uno cuelga del otro, así
    que ninguno es raíz y el recorrido de arriba no llega a ninguno. No
    debería existir —`saveHabit` no deja crearlos— pero si una fila se editó a
    mano en Supabase, el error no puede ser que esos hábitos DESAPAREZCAN de
    la pantalla. Se muestran sueltos, sin cadena, que es lo peor que puede
    pasarles: seguir estando.
  */
  for (const habit of habits) {
    if (!visited.has(habit.id)) walk(habit, 0, null);
  }

  return out;
}

/**
 * Los hábitos activos que toca ver hoy.
 *
 * Solo filtra. El orden lo pone `chainOrder`, que es la única autoridad sobre
 * el tema: dos criterios de orden conviviendo terminan divergiendo, y lo que
 * se ve en la lista de hoy tiene que ser lo mismo que se ve al editarlos.
 */
export function scheduledFor(habits: Habit[], iso: string) {
  // El mapa se arma con TODOS —incluidos los pausados y los de la otra
  // polaridad—: un hijo tiene que poder mirar a su padre aunque el padre no
  // vaya a dibujarse en la misma lista.
  const byId = indexById(habits);
  return habits.filter((habit) => habit.active && occursOn(habit, iso, byId));
}

/** Cómo se lee una regla en una línea. */
export function freqLabel(habit: Habit) {
  if (habit.freq === "daily") return "Todos los días";

  if (habit.freq === "weekdays") {
    const days = [...(habit.weekdays ?? [])].sort((a, b) => a - b);
    if (days.length === 7) return "Todos los días";
    if (days.length === 5 && days.join() === "1,2,3,4,5") return "Entre semana";
    if (days.length === 2 && days.join() === "0,6") return "Fines de semana";
    if (days.length === 1) return `Cada ${WEEKDAY_NAMES[days[0]]}`;
    return days.map((day) => WEEKDAY_NAMES[day].slice(0, 3)).join(" · ");
  }

  const every = habit.interval_days ?? 2;
  return every === 2 ? "Día por medio" : `Cada ${every} días`;
}

/* -------------------------------------------------------------------------- */
/* La hora: de deseo a cita                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Postgres devuelve `time` como "07:00:00" y el `<input type="time">` habla
 * "07:00". Todo lo demás en el código asume lo segundo, así que la conversión
 * pasa una sola vez, acá.
 */
export function hhmm(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Minutos desde medianoche, para poder comparar horas con un `<`. */
export function toMinutes(value: string | null | undefined) {
  const clean = hhmm(value);
  if (!clean) return null;
  const [hours, minutes] = clean.split(":").map(Number);
  return hours * 60 + minutes;
}

export function startMinutes(habit: Habit) {
  return toMinutes(habit.start_time);
}

export function endMinutes(habit: Habit) {
  return toMinutes(habit.end_time);
}

/** "07:00", "07:00–09:00", o nada si el hábito no tiene hora. */
export function timeLabel(habit: Habit) {
  const start = hhmm(habit.start_time);
  if (!start) return null;

  const end = hhmm(habit.end_time);
  return end ? `${start}–${end}` : start;
}

/**
 * Dónde cae este hábito respecto del reloj.
 *
 *   free   — no tiene hora: no hay momento equivocado para hacerlo.
 *   soon   — todavía no llegó.
 *   now    — es AHORA. Un momento puntual dura media hora en la pantalla,
 *            porque marcar a las 07:00:00 clavadas no lo hace nadie.
 *   passed — ya pasó. No es un reproche: es información.
 */
export type WindowState = "free" | "soon" | "now" | "passed";

/** Cuánto sigue diciendo "ahora" un hábito sin ventana de cierre. */
const PUNCTUAL_GRACE = 30;

export function windowState(habit: Habit, nowMinutes: number): WindowState {
  const start = startMinutes(habit);
  if (start == null) return "free";

  const end = endMinutes(habit) ?? start + PUNCTUAL_GRACE;

  if (nowMinutes < start) return "soon";
  return nowMinutes < end ? "now" : "passed";
}

/**
 * La intención de implementación, escrita como la escribe el libro.
 *
 * Se arma con lo que haya: nombrar la señal y la hora es lo que convierte
 * "quiero leer más" en algo que el cerebro puede ejecutar sin decidir. Si no
 * hay ni señal ni hora, devuelve nulo en vez de una frase a medias.
 */
export function intention(habit: Habit, afterName?: string | null) {
  const time = hhmm(habit.start_time);
  const cue = habit.cue?.trim();
  const place = habit.place?.trim();
  const after = afterName?.trim();
  if (!time && !cue && !after && !place) return null;

  const verb = habit.polarity === "good" ? "voy a" : "suelo";

  /*
    Encadenado, el disparador es el hábito anterior y nada más: la hora no
    entra aunque esté puesta, porque darle dos señales a algo que tiene una
    sola es lo que hace que ninguna funcione.

    El lugar sí entra en los dos casos — es contexto, no disparador— y va
    último, que es donde lo pone el libro: «a tal hora en tal lugar».
  */
  const when = [
    after
      ? `Después de ${lowerFirst(after)}`
      : [cue ? `Cuando ${lowerFirst(cue)}` : null, time ? `a las ${time}` : null]
          .filter(Boolean)
          .join(", "),
    place ? `en ${lowerFirst(place)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // Un hábito que solo tiene lugar arranca la frase con «en …», así que la
  // mayúscula se pone acá y no al armar cada pedazo.
  const base = `${upperFirst(when)}, ${verb} ${lowerFirst(habit.name)}.`;
  const reward = habit.reward?.trim();

  return reward ? `${base} Resultado: ${lowerFirst(reward)}.` : base;
}

function upperFirst(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Servir el café" → "servir el café", para que la frase no tenga saltos. */
function lowerFirst(text: string) {
  const clean = text.trim().replace(/\.+$/, "");
  // Una sigla escrita en mayúsculas es un nombre propio, no el arranque de
  // una oración: bajarle la primera letra a "IA" la rompe.
  if (clean.length > 1 && clean[1] === clean[1].toUpperCase()) return clean;
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

/* -------------------------------------------------------------------------- */
/* El empujón: qué avisar y cuándo                                             */
/* -------------------------------------------------------------------------- */

/**
 * Cuánta anticipación tiene la última llamada.
 *
 * Es fijo y no depende de cada cuánto corra el cron: quince minutos son los
 * que alcanzan para levantarse y hacer algo. Si esto colgara del intervalo,
 * poner el cron cada cinco minutos —que solo debería dar más puntería—
 * encogería el aviso a cinco minutos antes del cierre, que es cuando ya no
 * sirve de nada.
 */
export const LAST_CALL_LEAD = 15;

const MINUTES_IN_DAY = 1440;

/**
 * ¿Este instante pasó durante la franja que cubre esta corrida?
 *
 * `width` es el intervalo del cron. El límite de arriba es cerrado y el de
 * abajo abierto, así que dos corridas consecutivas nunca se pisan y ningún
 * minuto queda sin cubrir.
 */
function crossed(instant: number, now: number, width: number) {
  return instant > now - width && instant <= now;
}

export type NudgeKind = "start" | "last_call";

/**
 * Qué aviso corresponde mandar en esta corrida, si alguno.
 *
 * Vive acá y no adentro del route para poder probarla contra un reloj
 * inventado, sin base de datos ni push de por medio: es la única parte del
 * cron donde puede esconderse un error de aritmética, y es justo la que no se
 * ve fallar —un aviso que no salió no deja rastro—.
 *
 * No decide si el hábito toca hoy ni si ya está marcado: eso lo resuelve
 * `occursOn` y los registros del día, antes de llegar acá.
 */
export function nudgeKind(
  habit: Habit,
  nowMinutes: number,
  width: number
): NudgeKind | null {
  const start = startMinutes(habit);
  if (start == null) return null;

  if (crossed(start, nowMinutes, width)) return "start";

  /*
    La última corrida del día barre lo que queda hasta la medianoche.

    Sin esto, un hábito a las 23:50 no se avisaba nunca: la corrida de las
    23:45 todavía no lo alcanza y la siguiente ya es otro día —con la pizarra
    reiniciada—, así que su franja se perdía entre las dos. El agujero medía
    exactamente el intervalo del cron y no dejaba rastro, porque un aviso que
    no salió no aparece en ningún log.

    Avisar unos minutos antes es peor que a la hora exacta y muchísimo mejor
    que no avisar.
  */
  if (nowMinutes + width >= MINUTES_IN_DAY && start > nowMinutes) return "start";

  const end = endMinutes(habit);
  if (end == null) return null;

  /*
    Una ventana más corta que la anticipación no lleva última llamada: el
    aviso caería encima del de apertura —o antes— y serían dos globos
    diciendo lo mismo. Con diez minutos de ventana, con el de apertura basta.
  */
  if (end - start <= LAST_CALL_LEAD) return null;

  return crossed(end - LAST_CALL_LEAD, nowMinutes, width) ? "last_call" : null;
}

/* -------------------------------------------------------------------------- */
/* La métrica: consistencia, no rachas                                         */
/* -------------------------------------------------------------------------- */

/**
 * Lo que se muestra de un hábito en un tramo de días.
 *
 * `rate` es lo único que la pantalla necesita para pintar el anillo, y
 * significa lo mismo en los dos casos: qué tan bien va. Lo que cambia es qué
 * cuenta como bien.
 *
 *   bueno — días marcados sobre días que tocaban.
 *   malo  — días limpios sobre días que tocaban. Marcar es caer, así que el
 *           porcentaje sube justamente cuando NO se registra nada.
 *
 * Nunca se cuenta el futuro: un mes recién empezado no arranca en 3%.
 */
export type Consistency = {
  /** Días del tramo en los que el hábito tocaba y ya pasaron. */
  scheduled: number;
  /** Días con registro. */
  hit: number;
  /** Días que cuentan a favor: marcados si es bueno, limpios si es malo. */
  good: number;
  /** Veces totales — solo tiene sentido en los malos. */
  times: number;
  /** 0..1. Nulo cuando todavía no tocó ni un día: no hay nada que promediar. */
  rate: number | null;
};

export function consistency(
  habit: Habit,
  logs: HabitLog[],
  from: string,
  to: string,
  today: string,
  /** Necesario para que un hábito encadenado mida sobre los días del padre. */
  byId?: Map<string, Habit>
): Consistency {
  const last = to < today ? to : today;

  let scheduled = 0;
  for (let day = from; day <= last; day = addDays(day, 1)) {
    if (occursOn(habit, day, byId)) scheduled += 1;
  }

  const mine = logs.filter(
    (log) =>
      log.habit_id === habit.id &&
      log.done_on >= from &&
      log.done_on <= last &&
      occursOn(habit, log.done_on, byId)
  );

  const hit = mine.length;
  const times = mine.reduce((total, log) => total + log.times, 0);
  const good = habit.polarity === "good" ? hit : scheduled - hit;

  return {
    scheduled,
    hit,
    times,
    good,
    rate: scheduled === 0 ? null : good / scheduled,
  };
}

/** "18/22 días este mes · 81%". La frase que reemplaza a la racha. */
export function consistencyLabel(habit: Habit, stat: Consistency) {
  if (stat.rate == null) return "Todavía sin días que contar";

  const percent = Math.round(stat.rate * 100);
  const noun = habit.polarity === "good" ? "días" : "días limpios";

  return `${stat.good}/${stat.scheduled} ${noun} · ${percent}%`;
}

/** El tramo del mes que contiene a `iso`. `to` es inclusivo. */
export function monthRange(iso: string) {
  const date = fromIsoDay(iso);
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  return { from: isoDay(first), to: isoDay(last) };
}

/** Los últimos `count` días terminando hoy — la tira del calendario. */
export function lastDays(today: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    addDays(today, index - count + 1)
  );
}

/* -------------------------------------------------------------------------- */
/* Tareas                                                                      */
/* -------------------------------------------------------------------------- */

export type TaskUrgency = "overdue" | "today" | "soon" | "someday";

export function taskUrgency(task: Task, now = new Date()): TaskUrgency {
  if (!task.due_at) return "someday";

  const due = new Date(task.due_at);
  if (due.getTime() < now.getTime()) return "overdue";
  if (isoDay(due) === isoDay(now)) return "today";
  return "soon";
}

/**
 * El orden de la pila de arriba: primero lo que ya te falló, después lo de
 * hoy, después lo que viene, y al fondo lo que no tiene fecha.
 */
const URGENCY_WEIGHT: Record<TaskUrgency, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  someday: 3,
};

export function sortTasks(tasks: Task[], now = new Date()) {
  return [...tasks].sort((a, b) => {
    const weight =
      URGENCY_WEIGHT[taskUrgency(a, now)] - URGENCY_WEIGHT[taskUrgency(b, now)];
    if (weight !== 0) return weight;

    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    return a.created_at.localeCompare(b.created_at);
  });
}

/** "Venció hace 3 días", "Hoy 18:30", "Sin fecha". */
export function dueLabel(task: Task, now = new Date()) {
  if (!task.due_at) return "Sin fecha";

  const due = new Date(task.due_at);
  const days = daysBetween(isoDay(now), isoDay(due));
  const time = due.toLocaleTimeString("es-GT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;

  if (days === 0) return hasTime ? `Hoy ${time}` : "Hoy";
  if (days === 1) return hasTime ? `Mañana ${time}` : "Mañana";
  if (days === -1) return "Venció ayer";
  if (days < -1) return `Venció hace ${Math.abs(days)} días`;
  if (days < 7) return `En ${days} días`;

  return due.toLocaleDateString("es-GT", { day: "numeric", month: "short" });
}

/** El valor de un `<input type="datetime-local">` a partir de la fila. */
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/* El recuerdo: escribir un día que ya cerró                                   */
/* -------------------------------------------------------------------------- */

/**
 * Hasta dónde atrás se puede escribir.
 *
 * La pizarra sigue borrándose sola: lo que no se marcó ayer no aparece hoy
 * como deuda, y esa promesa no se toca. Pero olvidarse de ABRIR la app no es
 * lo mismo que no haber hecho el hábito, y obligar a que el registro mienta
 * por eso convierte el porcentaje del mes en ruido.
 *
 * Una semana es el límite justo: alcanza para el fin de semana que pasó sin
 * teléfono y es demasiado poco para reescribir un mes entero desde la
 * memoria, que es exactamente lo que haría que el número deje de valer.
 */
export const RECALL_DAYS = 7;

/** El día más viejo que todavía se puede escribir. */
export function recallFloor(today: string) {
  return addDays(today, -RECALL_DAYS);
}

/**
 * El día que la pantalla —o la acción— va a tocar, ya acotado.
 *
 * Todo lo que viene de la URL o del cliente pasa por acá, así que no hay
 * forma de escribir el futuro ni de colarse más atrás del piso: cualquier
 * valor raro cae en hoy, que es el único día que siempre es legal.
 */
export function resolveDay(raw: unknown, today: string) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  if (raw >= today) return today;
  const floor = recallFloor(today);
  return raw < floor ? today : raw;
}

/** "Hoy", "Ayer", "Anteayer", "Jueves". El nombre corto del día abierto. */
export function relativeDayLabel(iso: string, today: string) {
  const back = daysBetween(iso, today);
  if (back <= 0) return "Hoy";
  if (back === 1) return "Ayer";
  if (back === 2) return "Anteayer";

  const name = WEEKDAY_NAMES[fromIsoDay(iso).getDay()];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "hace 3 días", para el sello del encabezado. Nulo si el día es hoy. */
export function recallDistance(iso: string, today: string) {
  const back = daysBetween(iso, today);
  if (back <= 0) return null;
  return back === 1 ? "hace 1 día" : `hace ${back} días`;
}
