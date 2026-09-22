"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Flame, Plate, Trash } from "@/components/icons";
import { formatKcal, mealMacros, PORTIONS, type Meal } from "@/lib/fuel";
import { deleteMeal, setPortion } from "./actions";

export type ListedMeal = Meal & { time: string };

/**
 * Lo que comiste hoy, lo último arriba.
 *
 * Cada fila se abre en el lugar para corregir la porción o borrarla: son las
 * dos únicas cosas que se hacen con una comida pasada, y no ameritan otra
 * pantalla.
 */
export function MealList({
  meals,
  delay = 0,
  empty = "Todavía nada hoy. La primera foto enciende el fogón.",
}: {
  meals: ListedMeal[];
  delay?: number;
  empty?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (meals.length === 0) {
    return (
      <p
        className="kindle e-sunk px-4 py-5 text-center text-[0.875rem] leading-relaxed text-[var(--e-ink-3)]"
        style={{ "--d": `${delay}ms` } as CSSProperties}
      >
        {empty}
      </p>
    );
  }

  return (
    <ul className="e-card kindle overflow-hidden" style={{ "--d": `${delay}ms` } as CSSProperties}>
      {meals.map((meal, index) => (
        <Row
          key={meal.id}
          meal={meal}
          first={index === 0}
          open={open === meal.id}
          onToggle={() => setOpen((current) => (current === meal.id ? null : meal.id))}
        />
      ))}
    </ul>
  );
}

function Row({
  meal,
  first,
  open,
  onToggle,
}: {
  meal: ListedMeal;
  first: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [busy, start] = useTransition();
  const [portion, setLocal] = useState(meal.portion);
  const kcal = mealMacros({ ...meal, portion }).kcal;

  return (
    <li
      className={`meal-row ${first ? "" : "border-t border-[var(--e-hair)]"}`}
      data-open={open}
      style={{ opacity: busy ? 0.6 : 1 }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
      >
        {meal.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura en data URL
          <img src={meal.thumb} alt="" className="meal-thumb" />
        ) : (
          <span className="meal-thumb grid place-items-center text-[var(--e-ink-3)]">
            {meal.source === "menu" ? <Plate className="size-5" /> : <Flame className="size-5" />}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem]">{meal.name}</span>
          <span className="mt-0.5 block text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
            {meal.time}
            {portion !== 1 ? ` · ${portion === 0.5 ? "½" : `×${portion}`} porción` : ""}
            {meal.source === "menu" ? " · de tu menú" : ""}
          </span>
        </span>

        <span className="e-figure text-[1.625rem] tabular-nums">{formatKcal(kcal)}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {meal.note ? (
            <p className="text-[0.8125rem] leading-relaxed text-[var(--e-ink-2)]">{meal.note}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-1.5" role="radiogroup" aria-label="Porción">
              {PORTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={portion === value}
                  data-on={portion === value}
                  disabled={busy}
                  onClick={() => {
                    setLocal(value);
                    start(() => setPortion(meal.id, value));
                  }}
                  className="e-opt h-10 text-[0.8125rem] tabular-nums"
                >
                  {value === 0.5 ? "½" : `×${value}`}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => start(() => deleteMeal(meal.id))}
              aria-label={`Borrar ${meal.name}`}
              className="e-key flex size-10 shrink-0 items-center justify-center text-[var(--e-over-ink)]"
            >
              <Trash className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
