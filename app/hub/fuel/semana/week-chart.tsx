"use client";

import { useState, type CSSProperties } from "react";
import { dayStatus, formatKcal, weekdayLetter, type WeekDay } from "@/lib/fuel";
import { MealList, type ListedMeal } from "../meal-list";

/**
 * Los siete días en barras, con la meta como una línea que los cruza.
 *
 * Una sola serie y una sola escala: la barra es lo que comiste, la línea es
 * lo que te tocaba. No hay leyenda porque no hay nada que distinguir —el
 * título ya dice qué es— y la única cifra impresa es la del día elegido:
 * siete números encima de siete barras se leen como una tabla mal hecha.
 *
 * Tocar una barra abre ese día abajo, con sus comidas. Es el tooltip, pero
 * en un teléfono no existe el hover, así que se vuelve selección.
 */
export function WeekChart({
  days,
  meals,
  target,
  today,
  labels,
}: {
  days: WeekDay[];
  meals: ListedMeal[];
  target: number;
  today: string;
  /** "martes 22 de septiembre", ya formateado en el servidor. */
  labels: Record<string, string>;
}) {
  const [selected, setSelected] = useState(today);

  const top = Math.max(target * 1.25, ...days.map((day) => day.kcal * 1.08));
  const pct = (value: number) => `${(value / top) * 100}%`;

  const current = days.find((day) => day.day === selected) ?? days[days.length - 1];
  const status = dayStatus(current.kcal, target);
  const dayMeals = meals.filter((meal) => meal.eaten_on === current.day);

  return (
    <>
      <section className="kindle flex flex-col gap-3" style={{ "--d": "240ms" } as CSSProperties}>
        <div className="relative h-[13.5rem]">
          {/* La meta: una línea punteada y su cifra, en tinta, no en color. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-[var(--e-ink-3)]"
            style={{ bottom: pct(target) }}
          >
            <span className="absolute -top-5 right-0 text-[0.6875rem] text-[var(--e-ink-3)] tabular-nums">
              meta {formatKcal(target)}
            </span>
          </div>

          <div role="tablist" aria-label="Días de la semana" className="flex h-full items-end gap-1.5">
            {days.map((day, index) => {
              const on = day.day === current.day;
              const tone = day.count === 0 ? "empty" : dayStatus(day.kcal, target).tone;
              return (
                <button
                  key={day.day}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={`${labels[day.day]}: ${
                    day.count === 0 ? "sin registros" : `${formatKcal(day.kcal)} kilocalorías`
                  }`}
                  onClick={() => setSelected(day.day)}
                  className="week-col group relative flex h-full flex-1 flex-col justify-end"
                  data-on={on}
                >
                  {on && day.count > 0 ? (
                    <span className="relative z-20 -mx-2 pb-1.5 text-center text-[0.75rem] font-medium whitespace-nowrap tabular-nums">
                      {formatKcal(day.kcal)}
                    </span>
                  ) : null}
                  <span
                    className="week-bar block w-full"
                    data-tone={tone}
                    style={
                      {
                        height: day.count === 0 ? "3px" : pct(day.kcal),
                        "--d": `${320 + index * 60}ms`,
                      } as CSSProperties
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div aria-hidden="true" className="flex gap-1.5">
          {days.map((day) => (
            <span
              key={day.day}
              className="flex-1 text-center text-[0.75rem] tabular-nums"
              style={{
                color: day.day === current.day ? "var(--e-ink)" : "var(--e-ink-3)",
                fontWeight: day.day === today ? 600 : 400,
              }}
            >
              {day.day === today ? "Hoy" : weekdayLetter(day.day)}
            </span>
          ))}
        </div>

        {/* La misma información como tabla, para lectores de pantalla. */}
        <table className="sr-only">
          <caption>Calorías por día contra la meta de {formatKcal(target)}</caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Kilocalorías</th>
              <th scope="col">Comidas</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day}>
                <th scope="row">{labels[day.day]}</th>
                <td>{day.count === 0 ? "sin registros" : formatKcal(day.kcal)}</td>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="e-display text-[1.5rem] first-letter:uppercase">
            {current.day === today ? "Hoy" : labels[current.day]}
          </h2>
          <span className="shrink-0 text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
            {current.count === 0
              ? "sin registros"
              : status.remaining >= 0
                ? `${formatKcal(current.kcal)} · ${current.day === today ? "faltan" : "faltaron"} ${formatKcal(status.remaining)}`
                : `${formatKcal(current.kcal)} · ${formatKcal(-status.remaining)} de más`}
          </span>
        </div>
        {/* La llave remonta la lista: cada día arranca con todo cerrado. */}
        <MealList key={current.day} meals={dayMeals} empty="Ese día no quedó nada registrado." />
      </section>
    </>
  );
}
