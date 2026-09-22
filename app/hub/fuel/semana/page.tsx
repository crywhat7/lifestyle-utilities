import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { TIMEZONE } from "@/lib/cron";
import {
  formatKcal,
  groupWeek,
  lastSevenDays,
  weekSummary,
  type Goal,
} from "@/lib/fuel";
import { FUEL_PATH, fuelClient, loadMealsBetween, loadProfile, PLAN_PATH, today } from "../data";
import { MissingMigration } from "../missing";
import { WeekChart } from "./week-chart";

export const metadata: Metadata = {
  title: "Tu semana · Fuel",
  description: "Los últimos siete días contra tu meta: promedio, días en meta y balance.",
};

const TIME = new Intl.DateTimeFormat("es-HN", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Las fechas ISO ya son del día local: se formatean al mediodía UTC para que
// ninguna zona las corra al día anterior.
const LONG = new Intl.DateTimeFormat("es-HN", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function WeekPage() {
  const { supabase, user } = await fuelClient();
  const now = today();
  const days = lastSevenDays(now);

  const [{ profile, missing }, meals] = await Promise.all([
    loadProfile(supabase, user.id),
    loadMealsBetween(supabase, user.id, days[0], now),
  ]);

  const target = profile?.target_kcal ?? null;

  return (
    <main className="relative flex flex-1 flex-col gap-8 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div aria-hidden="true" className="hearth-glow" />

      <header className="kindle flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={FUEL_PATH} className="e-key flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]">
          <ArrowBack className="size-4" />
          Fuel
        </NavLink>
        <span className="e-eyebrow">Semana</span>
      </header>

      {missing ? (
        <MissingMigration />
      ) : !target || !profile ? (
        <section className="kindle flex flex-col gap-4" style={{ "--d": "80ms" } as CSSProperties}>
          <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
            Sin meta,
            <br />
            <em className="text-[var(--e-ink-hot)]">no hay semana.</em>
          </h1>
          <NavLink
            href={PLAN_PATH}
            className="e-key e-key-lit flex h-14 items-center justify-center text-[0.9375rem] font-medium"
          >
            Armar mi plan
          </NavLink>
        </section>
      ) : (
        <Week
          days={groupWeek(meals, days)}
          meals={meals.map((meal) => ({ ...meal, time: TIME.format(new Date(meal.eaten_at)) }))}
          target={target}
          goal={profile.goal}
          goals={{ protein: profile.protein_g ?? 0, carbs: profile.carbs_g ?? 0, fat: profile.fat_g ?? 0 }}
          today={now}
          labels={Object.fromEntries(days.map((day) => [day, LONG.format(new Date(`${day}T12:00:00Z`))]))}
        />
      )}
    </main>
  );
}

/**
 * La semana en tres lecturas, de lo más general a lo más fino: el promedio
 * diario en grande, dos cifras que lo explican (días en meta y balance) y
 * las barras día por día para ir a buscar el porqué.
 */
function Week({
  days,
  meals,
  target,
  goal,
  goals,
  today,
  labels,
}: {
  days: ReturnType<typeof groupWeek>;
  meals: Parameters<typeof WeekChart>[0]["meals"];
  target: number;
  goal: Goal;
  goals: { protein: number; carbs: number; fat: number };
  today: string;
  labels: Record<string, string>;
}) {
  const summary = weekSummary(days, target);
  const diff = summary.average - target;

  /*
    El balance se dice según la meta: para quien quiere bajar, el déficit es
    el avance; para quien quiere subir, lo es el superávit. El número es el
    mismo, lo que cambia es si es buena noticia.
  */
  const kg = Math.abs(summary.kg);
  const kgText = kg >= 0.05 ? ` ≈ ${kg.toFixed(1)} kg` : "";
  const balanceLabel = summary.balance <= 0 ? "Déficit" : "Superávit";
  const onTrack =
    goal === "lose" ? summary.balance < 0 : goal === "gain" ? summary.balance > 0 : Math.abs(diff) <= target * 0.05;

  if (summary.logged === 0) {
    return (
      <>
        <section className="kindle" style={{ "--d": "80ms" } as CSSProperties}>
          <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
            Una semana
            <br />
            <em className="text-[var(--e-ink-hot)]">en blanco.</em>
          </h1>
          <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
            Cuando registres algunas comidas, acá vas a ver tu promedio, los
            días en meta y cuánto te acercaste a tu objetivo.
          </p>
        </section>
        <WeekChart days={days} meals={meals} target={target} today={today} labels={labels} />
      </>
    );
  }

  return (
    <>
      <section className="kindle" style={{ "--d": "80ms" } as CSSProperties}>
        <p className="e-eyebrow">Promedio por día</p>
        <p className="mt-4 flex items-end gap-3">
          <span className="e-figure text-[clamp(5rem,27vw,7.5rem)]">{formatKcal(summary.average)}</span>
          <span className="mb-3 text-[0.875rem] leading-tight text-[var(--e-ink-3)]">
            kcal
            <br />
            {diff === 0 ? "justo" : `${formatKcal(Math.abs(diff))} ${diff > 0 ? "arriba" : "abajo"}`}
          </span>
        </p>
        <p className="mt-3 text-[0.8125rem] text-[var(--e-ink-3)]">
          {summary.logged === 7
            ? `Los 7 días registrados. Tu meta es ${formatKcal(target)}.`
            : `Sobre ${summary.logged} de 7 días con registros; los vacíos no cuentan. Tu meta es ${formatKcal(target)}.`}
        </p>
      </section>

      <section className="kindle grid grid-cols-2 gap-3" style={{ "--d": "160ms" } as CSSProperties}>
        <div className="e-card p-4">
          <p className="e-eyebrow tracking-[0.16em]">En meta</p>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="e-figure text-[2.75rem]">{summary.onTarget}</span>
            <span className="text-[0.8125rem] text-[var(--e-ink-3)]">de {summary.logged} días</span>
          </p>
        </div>
        <div className="e-card p-4">
          <p className="e-eyebrow tracking-[0.16em]">{balanceLabel}</p>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span
              className="e-figure text-[2.75rem]"
              style={{ color: onTrack ? "var(--e-ink-hot)" : "var(--e-ink)" }}
            >
              {formatKcal(Math.abs(summary.balance))}
            </span>
          </p>
          <p className="mt-1 text-[0.75rem] text-[var(--e-ink-3)]">kcal{kgText}</p>
        </div>
      </section>

      <WeekChart days={days} meals={meals} target={target} today={today} labels={labels} />

      <section className="kindle flex flex-col gap-3" style={{ "--d": "480ms" } as CSSProperties}>
        <h2 className="e-display text-[1.5rem]">Macros promedio</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: "p", label: "Proteína", value: summary.macros.protein, goal: goals.protein },
            { key: "c", label: "Carbos", value: summary.macros.carbs, goal: goals.carbs },
            { key: "g", label: "Grasa", value: summary.macros.fat, goal: goals.fat },
          ].map((row) => {
            const ratio = row.goal > 0 ? row.value / row.goal : 0;
            return (
              <div key={row.key} className="flex flex-col gap-2">
                <span className="e-eyebrow tracking-[0.16em]">{row.label}</span>
                <span className="text-[0.875rem] tabular-nums">
                  {row.value}
                  <span className="text-[var(--e-ink-3)]"> / {row.goal} g</span>
                </span>
                <span className="macro-rail">
                  <span
                    className="macro-fill block"
                    data-over={ratio > 1.1}
                    style={{ "--f": Math.min(1, ratio) } as CSSProperties}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
