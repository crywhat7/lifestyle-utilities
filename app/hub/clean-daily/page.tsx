import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, Pulse, Sliders } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  consistency,
  longDayLabel,
  monthRange,
  scheduledFor,
  sortTasks,
  type HabitLog,
} from "@/lib/habits";
import {
  cleanClient,
  clock,
  loadHabits,
  loadLogs,
  loadTasks,
  today,
} from "./data";
import { TodayBoard } from "./today-board";
import { TaskBoard } from "./task-board";

export const metadata: Metadata = {
  title: "Clean Daily",
  description:
    "Tus hábitos del día en una pizarra que se borra sola, y las tareas que no mueren hasta que las marcás.",
};

export default async function CleanDailyPage() {
  const { supabase, user } = await cleanClient();
  const day = today();
  const { from } = monthRange(day);

  /*
    Las tres consultas salen juntas: ninguna necesita el resultado de la
    otra, y encadenarlas era pagar tres viajes a Supabase para pintar una
    pantalla que se abre varias veces al día.

    Los registros se piden del mes entero, no solo de hoy: con esa misma
    lista se arma la fila del día y el porcentaje de consistencia del pie.
  */
  const [habits, logs, tasks] = await Promise.all([
    loadHabits(supabase, user.id),
    loadLogs(supabase, user.id, from, day),
    loadTasks(supabase, user.id),
  ]);

  const scheduled = scheduledFor(habits, day);
  const todayLogs = logs.filter((log) => log.done_on === day);
  const open = sortTasks(tasks.open);

  return (
    <main className="relative flex flex-1 flex-col gap-6 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header
        className="settle flex items-center justify-between"
        style={{ "--d": "0ms" } as CSSProperties}
      >
        <NavLink
          href="/hub"
          className="gkey flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]"
        >
          <ArrowBack className="size-4" />
          Hub
        </NavLink>

        <span className="flex items-center gap-2">
          <NavLink
            href="/hub/clean-daily/ritmo"
            aria-label="Ritmo del mes"
            className="gkey flex size-10 items-center justify-center"
          >
            <Pulse className="size-4" />
          </NavLink>
          <NavLink
            href="/hub/clean-daily/habitos"
            aria-label="Mis hábitos"
            className="gkey flex size-10 items-center justify-center"
          >
            <Sliders className="size-4" />
          </NavLink>
        </span>
      </header>

      {/*
        Arriba y primero: lo único de esta pantalla que sí se acumula.
        Si no hay nada pendiente, la sección se encoge a una línea y el día
        empieza donde tiene que empezar.
      */}
      <TaskBoard open={open} done={tasks.done} />

      {/*
        El momento firma vive adentro del tablero, no acá: el número grande
        del día tiene que moverse en el mismo toque que marca el hábito, sin
        esperar la vuelta del servidor.
      */}
      <TodayBoard
        habits={scheduled}
        logs={todayLogs}
        dayLabel={longDayLabel(day)}
        nowMinutes={clock()}
      />

      <MonthPulse habits={habits} logs={logs} from={from} day={day} />
    </main>
  );
}

/**
 * El pie: una sola cifra del mes y la puerta al detalle.
 *
 * Se agrega sobre todos los hábitos en vez de promediar porcentajes: un
 * hábito de tres días al mes no puede pesar lo mismo que uno diario, y el
 * promedio de promedios miente justamente en ese caso.
 */
function MonthPulse({
  habits,
  logs,
  from,
  day,
}: {
  habits: Awaited<ReturnType<typeof loadHabits>>;
  logs: HabitLog[];
  from: string;
  day: string;
}) {
  const active = habits.filter((habit) => habit.active);
  if (active.length === 0) return null;

  const totals = active.reduce(
    (acc, habit) => {
      const stat = consistency(habit, logs, from, day, day);
      return { good: acc.good + stat.good, scheduled: acc.scheduled + stat.scheduled };
    },
    { good: 0, scheduled: 0 }
  );

  const percent =
    totals.scheduled === 0
      ? null
      : Math.round((totals.good / totals.scheduled) * 100);

  return (
    <NavLink
      href="/hub/clean-daily/ritmo"
      className="pane settle mt-auto flex items-center gap-4 p-4"
      style={{ "--d": "560ms" } as CSSProperties}
    >
      {/* El número va afuera del anillo: la máscara que abre el agujero
          recorta también a los hijos, así que adentro no se ve nada. */}
      <span className="relative size-14 shrink-0">
        <span
          className="ring absolute inset-0"
          style={{ "--p": percent ?? 0 } as CSSProperties}
        />
        <span className="absolute inset-0 grid place-items-center text-[0.8125rem] tabular-nums">
          {percent == null ? "—" : `${percent}%`}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="glass-eyebrow block">Ritmo del mes</span>
        <span className="mt-1.5 block text-[0.9375rem] text-[var(--g-ink-2)]">
          {percent == null
            ? "Todavía sin días que contar"
            : `${totals.good} de ${totals.scheduled} días a favor · ${percent}%`}
        </span>
      </span>
      <Pulse className="size-4 shrink-0 text-[var(--g-ink-3)]" />
    </NavLink>
  );
}
