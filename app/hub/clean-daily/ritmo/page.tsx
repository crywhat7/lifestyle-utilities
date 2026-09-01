import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, Drop } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  consistency,
  consistencyLabel,
  freqLabel,
  lastDays,
  monthLabel,
  monthRange,
  occursOn,
  type Habit,
  type HabitLog,
} from "@/lib/habits";
import { cleanClient, loadHabits, loadLogs, today } from "../data";

export const metadata: Metadata = {
  title: "Ritmo · Clean Daily",
  description: "Tu consistencia del mes en porcentaje, sin rachas que romper.",
};

/** Cuántos días de historia entran cómodos en una columna de teléfono. */
const STRIP = 21;

export default async function RhythmPage() {
  const { supabase, user } = await cleanClient();
  const day = today();
  const { from } = monthRange(day);

  // La tira de 21 días puede empezar el mes anterior; el rango se estira
  // hasta el más viejo de los dos para no pedir dos veces lo mismo.
  const strip = lastDays(day, STRIP);
  const since = strip[0] < from ? strip[0] : from;

  const [habits, logs] = await Promise.all([
    loadHabits(supabase, user.id),
    loadLogs(supabase, user.id, since, day),
  ]);

  const active = habits.filter((habit) => habit.active);
  const stats = active.map((habit) => ({
    habit,
    stat: consistency(habit, logs, from, day, day),
  }));

  const totals = stats.reduce(
    (acc, row) => ({
      good: acc.good + row.stat.good,
      scheduled: acc.scheduled + row.stat.scheduled,
    }),
    { good: 0, scheduled: 0 }
  );

  const percent =
    totals.scheduled === 0
      ? null
      : Math.round((totals.good / totals.scheduled) * 100);

  return (
    <main className="relative flex flex-1 flex-col gap-6 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header
        className="settle flex items-center justify-between"
        style={{ "--d": "0ms" } as CSSProperties}
      >
        <NavLink
          href="/hub/clean-daily"
          className="gkey flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]"
        >
          <ArrowBack className="size-4" />
          Hoy
        </NavLink>
      </header>

      {/* El momento firma de esta pantalla: un porcentaje, nunca una racha. */}
      <section className="settle" style={{ "--d": "120ms" } as CSSProperties}>
        <p className="glass-eyebrow">{monthLabel(day)}</p>
        <h1 className="glass-display mt-3 flex items-end gap-3 text-[clamp(3.5rem,22vw,5.5rem)] tabular-nums">
          {percent == null ? <span className="italic">Sin datos</span> : `${percent}%`}
        </h1>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--g-ink-2)]">
          {percent == null
            ? "Cuando pase el primer día que toque, el número aparece acá."
            : `${totals.good} de ${totals.scheduled} días a favor en el mes. Una racha rota vuelve a cero; esto no.`}
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        {stats.length === 0 ? (
          <p className="text-[0.875rem] text-[var(--g-ink-3)]">
            Todavía no hay hábitos activos que medir.
          </p>
        ) : null}

        {stats.map(({ habit, stat }, index) => (
          <article
            key={habit.id}
            className="pane settle flex flex-col gap-3.5 p-4"
            style={{ "--d": `${220 + index * 60}ms` } as CSSProperties}
          >
            <div className="flex items-center gap-3.5">
              <span className="relative size-12 shrink-0">
                <span
                  className="ring absolute inset-0"
                  style={
                    {
                      "--p": Math.round((stat.rate ?? 0) * 100),
                      "--ring-color":
                        habit.polarity === "bad"
                          ? "var(--g-bad-lit)"
                          : "var(--g-good-lit)",
                    } as CSSProperties
                  }
                />
                <span className="absolute inset-0 grid place-items-center text-[0.6875rem] tabular-nums">
                  {stat.rate == null ? "—" : `${Math.round(stat.rate * 100)}%`}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {habit.polarity === "bad" ? (
                    <Drop className="size-3.5 shrink-0 text-[var(--g-bad-ink)]" />
                  ) : null}
                  <span className="truncate text-[1.0625rem]">{habit.name}</span>
                </span>
                <span className="mt-1 block truncate text-[0.75rem] text-[var(--g-ink-3)]">
                  {consistencyLabel(habit, stat)}
                </span>
              </span>
            </div>

            <DayStrip habit={habit} logs={logs} days={strip} />

            <p className="text-[0.75rem] text-[var(--g-ink-3)]">
              {freqLabel(habit)}
              {habit.polarity === "bad" && stat.times > 0
                ? ` · ${stat.times} ${habit.unit_label ?? "veces"} en el mes`
                : ""}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}

/**
 * Las últimas tres semanas en una línea.
 *
 * Tres estados y ninguno es un reproche: el día que no tocaba se dibuja como
 * un hueco tenue, el día a favor se enciende y el día en contra se queda
 * apagado. Un mes flojo se ve como una línea despareja, no como una racha
 * rota en la cara.
 */
function DayStrip({
  habit,
  logs,
  days,
}: {
  habit: Habit;
  logs: HabitLog[];
  days: string[];
}) {
  const hits = new Set(
    logs.filter((log) => log.habit_id === habit.id).map((log) => log.done_on)
  );

  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      {days.map((iso) => {
        const scheduled = occursOn(habit, iso);
        const hit = hits.has(iso);
        const favorable = habit.polarity === "good" ? hit : !hit;

        const tone = !scheduled
          ? "var(--g-track)"
          : favorable
            ? habit.polarity === "good"
              ? "var(--g-good-lit)"
              : "color-mix(in oklch, var(--g-good-lit) 45%, transparent)"
            : "color-mix(in oklch, var(--g-bad-lit) 70%, transparent)";

        return (
          <span
            key={iso}
            className="flex-1 rounded-[3px]"
            style={{
              background: tone,
              opacity: scheduled ? 1 : 0.7,
              height: scheduled ? "1.5rem" : "0.5rem",
            }}
          />
        );
      })}
    </div>
  );
}
