import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, ArrowOut, Plate, Sliders } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { minutesIn, TIMEZONE } from "@/lib/cron";
import {
  COURSE_LABEL,
  dayStatus,
  dayTotals,
  formatKcal,
  groupWeek,
  lastSevenDays,
  suggestFromMenu,
  weekSummary,
  type WeekDay,
  type Macros,
} from "@/lib/fuel";
import {
  fuelClient,
  loadMealsBetween,
  loadMenu,
  loadProfile,
  MENU_PATH,
  PLAN_PATH,
  today,
  WEEK_PATH,
} from "./data";
import { EatButton } from "./eat-button";
import { Hearth } from "./hearth";
import { MealList } from "./meal-list";
import { MissingMigration } from "./missing";

export const metadata: Metadata = {
  title: "Fuel",
  description: "Tu meta diaria de calorías y un botón para registrar cada comida con una foto.",
};

// La foto viaja a la IA desde esta pantalla: a veces tarda más de 10 s.
export const maxDuration = 60;

const TIME = new Intl.DateTimeFormat("es-HN", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE = new Intl.DateTimeFormat("es-HN", {
  timeZone: TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function FuelPage() {
  const { supabase, user } = await fuelClient();
  const day = today();

  const days = lastSevenDays(day);

  // La semana sale en la misma consulta que hoy: son siete días de filas
  // chicas, y pedirlas aparte sería otro viaje para una franja de barras.
  const [{ profile, missing }, weekMeals, menu] = await Promise.all([
    loadProfile(supabase, user.id),
    loadMealsBetween(supabase, user.id, days[0], day),
    loadMenu(supabase, user.id),
  ]);

  const meals = weekMeals.filter((meal) => meal.eaten_on === day);
  const week = groupWeek(weekMeals, days);

  const totals = dayTotals(meals);
  const target = profile?.target_kcal ?? null;
  const status = target ? dayStatus(totals.kcal, target) : null;

  // Pasada la meta el calor sigue subiendo un poco más: se nota el exceso.
  const heat = status ? Math.min(1.25, status.ratio) : 0;

  const suggestion =
    target && menu && status ? suggestFromMenu(menu.items, status.remaining, minutesIn(TIMEZONE)) : null;

  return (
    <main
      className="relative flex flex-1 flex-col gap-6 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.25rem,env(safe-area-inset-bottom))]"
      data-tone={status?.tone ?? "cold"}
      data-heat=""
      style={{ "--heat": heat } as CSSProperties}
    >
      <div aria-hidden="true" className="hearth-glow" />

      <header className="kindle flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href="/hub" className="e-key flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]">
          <ArrowBack className="size-4" />
          Hub
        </NavLink>

        <span className="flex items-center gap-2">
          <NavLink
            href={MENU_PATH}
            aria-label="Menú"
            className="e-key flex h-10 items-center gap-2 px-4 text-[0.8125rem]"
          >
            <Plate className="size-4" />
            Menú
          </NavLink>
          <NavLink
            href={PLAN_PATH}
            aria-label="Mi plan"
            className="e-key flex size-10 items-center justify-center"
          >
            <Sliders className="size-4" />
          </NavLink>
        </span>
      </header>

      {missing ? (
        <MissingMigration />
      ) : target && status ? (
        <>
          <section className="flex flex-col items-center gap-1">
            <p className="e-eyebrow kindle mb-5 first-letter:uppercase" style={{ "--d": "80ms" } as CSSProperties}>
              {DATE.format(new Date())}
            </p>
            <Hearth target={target} eaten={totals.kcal} tone={status.tone} />
          </section>

          <MacroRow
            totals={totals}
            goal={{ protein: profile?.protein_g ?? 0, carbs: profile?.carbs_g ?? 0, fat: profile?.fat_g ?? 0 }}
          />

          {suggestion ? (
            <section
              className="e-card kindle flex items-center gap-3 p-4"
              style={{ "--d": "820ms" } as CSSProperties}
            >
              <span className="min-w-0 flex-1">
                <span className="e-eyebrow block">
                  {COURSE_LABEL[suggestion.item.course].one} que cabe
                </span>
                <span className="e-display mt-2 block text-[1.25rem] leading-tight">
                  {suggestion.item.name}
                </span>
                <span className="mt-1 block text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
                  {formatKcal(suggestion.item.kcal)} kcal · de tu menú
                </span>
              </span>
              <EatButton index={suggestion.index} compact />
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <div className="kindle flex items-baseline justify-between" style={{ "--d": "880ms" } as CSSProperties}>
              <h2 className="e-display text-[1.75rem]">Hoy</h2>
              <span className="text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
                {meals.length === 0
                  ? "sin registros"
                  : `${meals.length} ${meals.length === 1 ? "comida" : "comidas"}`}
              </span>
            </div>
            <MealList
              delay={940}
              meals={meals.map((meal) => ({ ...meal, time: TIME.format(new Date(meal.eaten_at)) }))}
            />
          </section>

          <WeekStrip days={week} target={target} today={day} />
        </>
      ) : (
        <FirstFire />
      )}
    </main>
  );
}

/**
 * Los tres rieles de macros. Llenan hasta la meta del plan y, pasados, se
 * encienden en carmesí: el exceso se ve en la misma barra, sin otra leyenda.
 */
function MacroRow({
  totals,
  goal,
}: {
  totals: Macros;
  goal: { protein: number; carbs: number; fat: number };
}) {
  const rows = [
    { key: "protein", label: "Proteína", eaten: totals.protein, goal: goal.protein },
    { key: "carbs", label: "Carbos", eaten: totals.carbs, goal: goal.carbs },
    { key: "fat", label: "Grasa", eaten: totals.fat, goal: goal.fat },
  ];

  return (
    <section className="kindle grid grid-cols-3 gap-4" style={{ "--d": "760ms" } as CSSProperties}>
      {rows.map((row) => {
        const ratio = row.goal > 0 ? row.eaten / row.goal : 0;
        return (
          <div key={row.key} className="flex flex-col gap-2">
            <span className="e-eyebrow tracking-[0.16em]">{row.label}</span>
            <span className="text-[0.875rem] tabular-nums">
              {row.eaten}
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
    </section>
  );
}

/**
 * La puerta a la semana: siete barras mudas y dos cifras. No se toca nada
 * acá —es un vistazo—; el detalle, día por día, vive en su pantalla.
 */
function WeekStrip({ days, target, today }: { days: WeekDay[]; target: number; today: string }) {
  const summary = weekSummary(days, target);
  const top = Math.max(target * 1.25, ...days.map((entry) => entry.kcal));

  return (
    <NavLink
      href={WEEK_PATH}
      className="e-card kindle mt-auto flex items-center gap-4 p-4"
      style={{ "--d": "1000ms" } as CSSProperties}
    >
      <span aria-hidden="true" className="relative flex h-11 w-[5.5rem] shrink-0 items-end gap-[3px]">
        <span
          className="absolute inset-x-0 border-t border-dashed border-[var(--e-ink-3)] opacity-60"
          style={{ bottom: `${(target / top) * 100}%` }}
        />
        {days.map((entry, index) => (
          <span
            key={entry.day}
            className="week-bar block flex-1"
            data-static="true"
            data-tone={entry.count === 0 ? "empty" : entry.kcal > target * 1.05 ? "over" : "burning"}
            style={
              {
                height: entry.count === 0 ? "2px" : `${(entry.kcal / top) * 100}%`,
                opacity: entry.day === today ? 1 : 0.7,
                "--d": `${1080 + index * 50}ms`,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="e-eyebrow block">Tu semana</span>
        <span className="mt-1.5 block text-[0.8125rem] text-[var(--e-ink-2)] tabular-nums">
          {summary.logged === 0
            ? "Todavía sin días que comparar"
            : `${formatKcal(summary.average)} promedio · ${summary.onTarget} de ${summary.logged} en meta`}
        </span>
      </span>
      <ArrowOut className="size-4 shrink-0 text-[var(--e-ink-3)]" />
    </NavLink>
  );
}

/**
 * Antes del plan, el fogón está apagado. No se puede contar hacia una meta
 * que no existe, así que la pantalla entera es una sola puerta: armarla.
 */
function FirstFire() {
  return (
    <section className="flex flex-1 flex-col justify-center gap-8 pb-10">
      <div className="kindle" style={{ "--d": "80ms" } as CSSProperties}>
        <p className="e-eyebrow">Fuel</p>
        <h1 className="e-display mt-4 text-[clamp(3.25rem,16vw,4.75rem)]">
          Primero,
          <br />
          <em className="text-[var(--e-ink-hot)]">tu meta.</em>
        </h1>
        <p className="mt-5 max-w-[30ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
          Contanos tu peso, altura, edad y si querés subir o bajar. La IA arma
          cuántas calorías te tocan por día, y desde ahí cada foto cuenta.
        </p>
      </div>

      <NavLink
        href={PLAN_PATH}
        className="e-key e-key-lit kindle flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
        style={{ "--d": "260ms" } as CSSProperties}
      >
        Armar mi plan
        <ArrowOut className="size-4" />
      </NavLink>
    </section>
  );
}
