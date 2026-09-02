"use client";

import { startTransition, useOptimistic, type CSSProperties } from "react";
import { Check, Drop, Minus, PlusSlot, Sunrise } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  chainOrder,
  freqLabel,
  timeLabel,
  windowState,
  type Habit,
  type HabitLog,
  type WindowState,
} from "@/lib/habits";
import { bumpHabit, markHabit } from "./actions";

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

/** Cuántas veces cayó hoy cada hábito. Sin entrada = día limpio. */
type DayState = Record<string, number>;

export function TodayBoard({
  habits,
  logs,
  dayLabel,
  nowMinutes,
  names,
}: {
  habits: Habit[];
  logs: HabitLog[];
  dayLabel: string;
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

  function toggle(habit: Habit) {
    const done = (state[habit.id] ?? 0) > 0;
    startTransition(async () => {
      patch({ id: habit.id, times: done ? 0 : 1 });
      await markHabit(habit.id, !done);
    });
  }

  function bump(habit: Habit, delta: number) {
    const next = Math.max(0, Math.min(99, (state[habit.id] ?? 0) + delta));
    startTransition(async () => {
      patch({ id: habit.id, times: next });
      await bumpHabit(habit.id, delta);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      {/* ── El momento firma ────────────────────────────────────────────── */}
      <div
        className="settle"
        style={{ "--d": "220ms" } as CSSProperties}
      >
        <p className="glass-eyebrow flex items-center gap-2">
          <Sunrise className="size-3.5" />
          {dayLabel}
        </p>

        {habits.length === 0 ? (
          <h1 className="glass-display mt-4 text-[clamp(2.5rem,12vw,3.5rem)]">
            Pizarra vacía
          </h1>
        ) : (
          <h1 className="glass-display mt-4 flex items-end gap-3 text-[clamp(3.25rem,19vw,5rem)] tabular-nums">
            {clear ? (
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
          {habits.length === 0
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
            const when = row.after
              ? armed
                ? "now"
                : "soon"
              : windowState(habit, nowMinutes);

            return (
              <article
                key={habit.id}
                className="habit pane settle flex items-center gap-3.5 p-3.5"
                data-polarity="good"
                data-done={done}
                /* Marcado ya no es "ahora": una vez hecho, la fila deja de
                   reclamar la atención aunque el reloj siga adentro. */
                data-when={done ? "passed" : when}
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
                      <span className="hour" data-when={done ? "passed" : when}>
                        {armed && !done ? "te toca" : "después"}
                      </span>
                    ) : (
                      <HourMark habit={habit} state={done ? "passed" : when} />
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
                {slips} hoy
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
                    <HourMark habit={habit} state={windowState(habit, nowMinutes)} />
                    <span className="line-clamp-2">
                      {times > 0
                        ? `${times} ${unit} hoy`
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

      {habits.length === 0 ? (
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
