"use client";

import { startTransition, useOptimistic, type CSSProperties } from "react";
import {
  Check,
  Chevron,
  Drop,
  History,
  Minus,
  PlusSlot,
  Sunrise,
} from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  addDays,
  chainOrder,
  freqLabel,
  timeLabel,
  windowState,
  type Habit,
  type HabitLog,
  type WindowState,
} from "@/lib/habits";
import { bumpHabit, markHabit } from "./actions";

/** La pantalla de un día: hoy sin parámetro, cualquier otro con `?d=`. */
function dayHref(iso: string, today: string) {
  return iso === today ? "/hub/clean-daily" : `/hub/clean-daily?d=${iso}`;
}

/**
 * La hora del hábito, con el peso que le corresponde según el reloj.
 *
 * Es lo mismo que un reloj de pared: los tres estados se leen de un vistazo
 * sin tener que comparar números. "Ahora" es lo único que se enciende —si
 * todo gritara, nada gritaría—; lo que ya pasó se apaga pero no desaparece,
 * porque a las 20:00 saber que la ventana de las 07:00 quedó abierta es
 * información, no un reproche.
 */
function HourMark({ habit, state }: { habit: Habit; state: WindowState }) {
  const label = timeLabel(habit);
  if (!label) return null;

  return (
    <span className="hour" data-when={state}>
      {state === "now" ? "ahora" : label}
    </span>
  );
}

/**
 * La puerta al día anterior — la tecla de un día normal.
 *
 * Chica y en la misma línea que la fecha, porque el recuerdo nace de la
 * fecha y porque no puede competirle al número del día. Un día cerrado
 * nunca aparece solo: hay que venir a buscarlo acá, y eso es exactamente lo
 * que lo mantiene siendo un recuerdo y no una deuda esperando en pantalla.
 */
function RecallKey({ day, today }: { day: string; today: string }) {
  return (
    <NavLink
      href={dayHref(addDays(day, -1), today)}
      className="gkey flex h-8 shrink-0 items-center gap-1.5 pr-3 pl-2.5 text-[0.6875rem] tracking-[0.08em] uppercase"
    >
      <History className="size-3.5" />
      Ayer
    </NavLink>
  );
}

/**
 * El riel del recuerdo — dónde estás parado y cómo se sale.
 *
 * Se lleva el renglón entero de la fecha en vez de convivir con ella: dentro
 * del pasado, saber qué día se está escribiendo ES el encabezado, y partirlo
 * en una fecha a la izquierda más un control apretado a la derecha dejaba a
 * las dos cosas sin aire. La fecha larga vive adentro del riel, entre las
 * dos flechas, y "Hoy" queda encendido al final: adentro del pasado, la
 * salida es lo más importante que la pantalla puede ofrecer.
 */
function DayRail({
  day,
  today,
  floor,
  dayLabel,
}: {
  day: string;
  today: string;
  floor: string;
  dayLabel: string;
}) {
  const previous = addDays(day, -1);
  const canGoBack = previous >= floor;

  return (
    <span className="recall">
      {/* El piso de la semana no se esconde: la tecla sigue ahí, apagada,
          diciendo hasta dónde llega la memoria que se puede escribir. */}
      {canGoBack ? (
        <NavLink
          href={dayHref(previous, today)}
          aria-label="Un día más atrás"
          className="recall-key"
        >
          <Chevron className="size-4 rotate-90" />
        </NavLink>
      ) : (
        <span className="recall-key recall-key-off" aria-hidden="true">
          <Chevron className="size-4 rotate-90" />
        </span>
      )}

      <span className="recall-face">{dayLabel}</span>

      <NavLink
        href={dayHref(addDays(day, 1), today)}
        aria-label="Un día adelante"
        className="recall-key"
      >
        <Chevron className="size-4 -rotate-90" />
      </NavLink>

      <NavLink href="/hub/clean-daily" className="recall-out">
        Hoy
      </NavLink>
    </span>
  );
}

/** Cuántas veces cayó ese día cada hábito. Sin entrada = día limpio. */
type DayState = Record<string, number>;

export function TodayBoard({
  habits,
  logs,
  day,
  today,
  floor,
  dayLabel,
  shortLabel,
  nowMinutes,
  names,
}: {
  habits: Habit[];
  logs: HabitLog[];
  /** El día abierto. Casi siempre hoy; con `?d=`, uno que ya cerró. */
  day: string;
  today: string;
  /** El día más viejo que todavía se puede escribir. */
  floor: string;
  dayLabel: string;
  /** "Hoy", "Ayer", "Anteayer", "Jueves" — el titular del día abierto. */
  shortLabel: string;
  /** id → nombre, de todos los hábitos. Para nombrar al padre ausente. */
  names: Record<string, string>;
  /**
   * La hora del servidor, en minutos desde medianoche y en la zona del
   * bolsillo. Viene por props y no de `new Date()` acá adentro porque el
   * cliente y el servidor pintarían HTML distinto y React tiraría un error
   * de hidratación en cada carga. Queda congelada hasta la próxima
   * revalidación, que ocurre en cada toque: para decir cuál hábito es "ahora"
   * alcanza de sobra.
   */
  nowMinutes: number;
}) {
  const past = day !== today;

  const initial: DayState = Object.fromEntries(
    logs.map((log) => [log.habit_id, log.times])
  );

  /*
    El toque tiene que verse antes que la red.

    Marcar un hábito es la interacción más repetida del módulo y viaja al
    servidor: sin esto, el cheque tardaba lo que tardara Supabase y el dedo
    ya se había ido. `useOptimistic` pinta el estado nuevo en el mismo frame
    y la revalidación de la Server Action lo confirma —o lo revierte sola si
    falló, sin que haya que manejar el error a mano acá.
  */
  const [state, patch] = useOptimistic(
    initial,
    (prev: DayState, next: { id: string; times: number }) => ({
      ...prev,
      [next.id]: next.times,
    })
  );

  /*
    Cada polaridad arma sus cadenas por separado, porque van en secciones
    distintas de la pantalla: un hábito bueno colgado de uno malo empieza
    cadena propia acá arriba en vez de desaparecer.
  */
  const good = chainOrder(habits.filter((habit) => habit.polarity === "good"));
  const bad = chainOrder(habits.filter((habit) => habit.polarity === "bad"));

  const doneCount = good.filter((row) => (state[row.habit.id] ?? 0) > 0).length;
  const clear = good.length > 0 && doneCount === good.length;
  const progress = good.length === 0 ? 0 : (doneCount / good.length) * 100;

  const slips = bad.reduce(
    (total, row) => total + (state[row.habit.id] ?? 0),
    0
  );

  /* "3 veces hoy" contra "3 veces ese día": la copia no puede decir hoy
     cuando la pantalla está parada en otro día. */
  const when = past ? "ese día" : "hoy";

  function toggle(habit: Habit) {
    const done = (state[habit.id] ?? 0) > 0;
    startTransition(async () => {
      patch({ id: habit.id, times: done ? 0 : 1 });
      await markHabit(habit.id, !done, day);
    });
  }

  function bump(habit: Habit, delta: number) {
    const next = Math.max(0, Math.min(99, (state[habit.id] ?? 0) + delta));
    startTransition(async () => {
      patch({ id: habit.id, times: next });
      await bumpHabit(habit.id, delta, day);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      {/* ── El momento firma ────────────────────────────────────────────── */}
      <div
        className="settle"
        style={{ "--d": "220ms" } as CSSProperties}
      >
        {/*
          El mismo renglón cuenta dos historias.

          En un día normal es la fecha con una tecla chica al costado: la
          puerta al pasado existe, pero no pesa. Adentro del pasado el riel
          se queda con el renglón entero —flechas, fecha y salida—, porque
          ahí saber qué día se está escribiendo ES el encabezado.
        */}
        {past ? (
          <DayRail day={day} today={today} floor={floor} dayLabel={dayLabel} />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="glass-eyebrow flex min-w-0 items-center gap-2">
              <Sunrise className="size-3.5 shrink-0" />
              <span className="truncate">{dayLabel}</span>
            </p>

            <RecallKey day={day} today={today} />
          </div>
        )}

        {habits.length === 0 ? (
          <h1 className="glass-display mt-4 text-[clamp(2.5rem,12vw,3.5rem)]">
            {past ? <span className="italic">{shortLabel}</span> : "Pizarra vacía"}
          </h1>
        ) : (
          <h1 className="glass-display mt-4 flex items-end gap-3 text-[clamp(3.25rem,19vw,5rem)] tabular-nums">
            {/*
              En el pasado el titular es el NOMBRE del día y no la cuenta: es
              lo primero que hay que saber antes de tocar nada. Va en itálica
              —el único uso de la itálica junto a "Despejado"— y así se
              distingue del número de hoy sin cambiar de tipografía ni de
              tamaño; la cuenta baja a satélite, que es el peso que le toca
              cuando la pregunta ya no es "cuánto llevo" sino "qué día es".
            */}
            {past ? (
              <>
                <span className="italic">{shortLabel}</span>
                <span className="pb-[0.14em] text-[0.34em] tracking-normal text-[var(--g-ink-3)]">
                  {doneCount} de {good.length || bad.length}
                </span>
              </>
            ) : clear ? (
              <span className="italic">Despejado</span>
            ) : (
              <>
                <span>{doneCount}</span>
                <span className="pb-[0.14em] text-[0.34em] tracking-normal text-[var(--g-ink-3)]">
                  de {good.length || bad.length}
                </span>
              </>
            )}
          </h1>
        )}

        <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--g-ink-2)]">
          {past
            ? habits.length === 0
              ? "Ese día no tocaba ningún hábito, así que no hay nada que anotar."
              : "Este día ya cerró. Lo que marques queda anotado en él y suma al ritmo del mes — no al de hoy."
            : habits.length === 0
              ? "Todavía no hay hábitos para hoy. Creá el primero y aparecerá acá cada día que toque."
              : clear
                ? "Todo lo de hoy está hecho. Mañana la lista vuelve a arrancar en cero, no en deuda."
                : "Lo que no marques hoy no se arrastra: a las 00:00 la lista vuelve limpia."}
        </p>

        {good.length > 0 ? (
          <div className="bar mt-5">
            <span
              className="bar-fill"
              style={{ width: `${progress}%` }}
              aria-hidden="true"
            />
          </div>
        ) : null}
      </div>

      {/* ── Lo que quiero sostener ───────────────────────────────────────── */}
      {good.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {good.map((row, index) => {
            const habit = row.habit;
            const done = (state[habit.id] ?? 0) > 0;

            /*
              Acá está el pago de la acumulación: el hijo no espera al reloj,
              espera al padre. En cuanto se marca el hábito anterior, el
              siguiente se enciende — que es exactamente la señal que el libro
              dice que hay que fabricar, solo que dibujada.
            */
            const armed = row.after ? (state[row.after.id] ?? 0) > 0 : false;
            const clockState = row.after
              ? armed
                ? "now"
                : "soon"
              : windowState(habit, nowMinutes);

            /*
              En un día cerrado el reloj no tiene nada que decir: nada es
              "ahora" a las siete de la mañana de anteayer. Todo se apaga a
              "ya pasó", que es literalmente lo que ocurrió — y así la lista
              deja de empujar y pasa a dejarse leer.
            */
            const mark = done || past ? "passed" : clockState;

            return (
              <article
                key={habit.id}
                className="habit pane settle flex items-center gap-3.5 p-3.5"
                data-polarity="good"
                data-done={done}
                /* Marcado ya no es "ahora": una vez hecho, la fila deja de
                   reclamar la atención aunque el reloj siga adentro. */
                data-when={mark}
                style={
                  {
                    "--d": `${300 + index * 55}ms`,
                    marginLeft:
                      row.depth > 0
                        ? `${Math.min(row.depth, 3) * 1.25}rem`
                        : undefined,
                  } as CSSProperties
                }
              >
                {row.depth > 0 ? (
                  <span aria-hidden="true" className="link-arm" />
                ) : null}
                <button
                  type="button"
                  onClick={() => toggle(habit)}
                  aria-pressed={done}
                  aria-label={`Marcar ${habit.name}`}
                  className="tick"
                  data-done={done}
                >
                  <Check className="tick-mark size-5" />
                </button>

                <span className="min-w-0 flex-1">
                  <span className="habit-name block text-[1.0625rem] leading-snug transition-colors">
                    {habit.name}
                  </span>
                  {/* `items-start` porque la línea puede envolver: con la
                      señal y el lugar juntos, centrar la píldora contra dos
                      renglones la deja flotando en el medio. */}
                  <span className="mt-1.5 flex items-start gap-2 text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
                    {row.after ? (
                      <span className="hour" data-when={mark}>
                        {armed && !done && !past ? "te toca" : "después"}
                      </span>
                    ) : (
                      <HourMark habit={habit} state={mark} />
                    )}
                    {/* La señal desplaza a la frecuencia: cuando existe, es lo
                        que de verdad dispara el hábito. Y si el padre no se
                        dibuja hoy, igual se nombra: decir "todos los días" de
                        algo que sigue a otro hábito sería mentir. */}
                    <span className="line-clamp-2">
                      {[
                        row.after
                          ? `de ${row.after.name.toLowerCase()}`
                          : habit.after_habit_id
                            ? `Después de ${(names[habit.after_habit_id] ?? "otro hábito").toLowerCase()}`
                            : habit.cue
                              ? `Cuando ${habit.cue.toLowerCase()}`
                              : freqLabel(habit),
                        // El lugar va último y se corta primero si no entra:
                        // saber QUÉ dispara el hábito importa más que dónde.
                        habit.place ? `en ${habit.place.toLowerCase()}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </span>
              </article>
            );
          })}
        </div>
      ) : null}

      {/* ── Lo que quiero contar ─────────────────────────────────────────── */}
      {bad.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2.5">
          <p className="glass-eyebrow flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Drop className="size-3.5" />
              Lo que estoy contando
            </span>
            {slips > 0 ? (
              <span className="text-[var(--g-bad-ink)] normal-case tracking-normal">
                {slips} {when}
              </span>
            ) : (
              <span className="normal-case tracking-normal">Día limpio</span>
            )}
          </p>

          {bad.map((row, index) => {
            const habit = row.habit;
            const times = state[habit.id] ?? 0;
            const unit = habit.unit_label ?? (times === 1 ? "vez" : "veces");

            return (
              <article
                key={habit.id}
                className="habit pane settle flex items-center gap-3 p-3.5"
                data-polarity="bad"
                data-done={times > 0}
                style={
                  { "--d": `${360 + (good.length + index) * 55}ms` } as CSSProperties
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="habit-name block text-[1.0625rem] leading-snug transition-colors">
                    {habit.name}
                  </span>
                  {/* `items-start` porque la línea puede envolver: con la
                      señal y el lugar juntos, centrar la píldora contra dos
                      renglones la deja flotando en el medio. */}
                  <span className="mt-1.5 flex items-start gap-2 text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
                    <HourMark
                      habit={habit}
                      state={past ? "passed" : windowState(habit, nowMinutes)}
                    />
                    <span className="line-clamp-2">
                      {times > 0
                        ? `${times} ${unit} ${when}`
                        : habit.after_habit_id
                          ? `Después de ${(
                              row.after?.name ??
                              names[habit.after_habit_id] ??
                              "otro hábito"
                            ).toLowerCase()}`
                          : freqLabel(habit)}
                    </span>
                  </span>
                </span>

                <span className="tally" data-hot={times > 0}>
                  <button
                    type="button"
                    className="tally-key"
                    onClick={() => bump(habit, -1)}
                    disabled={times === 0}
                    aria-label={`Restar una a ${habit.name}`}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="tally-count" aria-live="polite">
                    {times}
                  </span>
                  <button
                    type="button"
                    className="tally-key"
                    onClick={() => bump(habit, 1)}
                    aria-label={`Sumar una a ${habit.name}`}
                  >
                    <PlusSlot className="size-4" />
                  </button>
                </span>
              </article>
            );
          })}
        </div>
      ) : null}

      {/* En un día cerrado la invitación no va: crear un hábito hoy no le
          agrega nada a anteayer. */}
      {habits.length === 0 && !past ? (
        <NavLink
          href="/hub/clean-daily/habitos"
          className="gkey settle flex h-12 items-center justify-center gap-2 text-[0.875rem]"
          style={{ "--d": "340ms" } as CSSProperties}
        >
          <PlusSlot className="size-4" />
          Crear mi primer hábito
        </NavLink>
      ) : null}
    </section>
  );
}
