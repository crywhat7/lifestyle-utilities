"use client";

import { useState, type CSSProperties } from "react";
import { COURSE_LABEL, COURSES, formatKcal, type Course, type MenuItem } from "@/lib/fuel";
import { EatButton } from "../eat-button";

/**
 * El menú como carta de restaurante: el nombre a la izquierda, una línea de
 * puntos y el precio —acá, las calorías— a la derecha. Es la forma más vieja
 * y más legible de comparar platos, y nadie tiene que aprenderla.
 *
 * Un tiempo de comida a la vez: veinticinco platos seguidos son una lista;
 * cinco son una decisión.
 */
export function MenuBoard({ items, initial }: { items: MenuItem[]; initial: Course }) {
  const [course, setCourse] = useState<Course>(initial);

  const indexed = items.map((item, index) => ({ item, index }));
  const shown = indexed.filter(({ item }) => item.course === course);

  return (
    <section className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Tiempos de comida"
        className="kindle -mx-5 flex gap-1 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
        style={{ "--d": "140ms" } as CSSProperties}
      >
        {COURSES.map((value) => {
          const total = indexed.filter(({ item }) => item.course === value).length;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={course === value}
              onClick={() => setCourse(value)}
              className="e-tab"
            >
              {COURSE_LABEL[value].many}
              <span className="ml-1.5 text-[var(--e-ink-3)] tabular-nums">{total}</span>
            </button>
          );
        })}
      </div>

      {/* La llave remonta la lista y re-dispara la entrada escalonada. */}
      <ol key={course} role="tabpanel" className="flex flex-col gap-3">
        {shown.map(({ item, index }, position) => (
          <li
            key={`${item.name}-${index}`}
            className="e-card kindle flex flex-col gap-3 p-5"
            style={{ "--d": `${180 + position * 70}ms` } as CSSProperties}
          >
            <div className="flex items-baseline">
              <span className="e-figure mr-3 text-[1rem] text-[var(--e-ink-hot)]">
                {String(position + 1).padStart(2, "0")}
              </span>
              <h3 className="e-display text-[1.375rem] leading-[1.05]">{item.name}</h3>
              <span aria-hidden="true" className="leader" />
              <span className="e-figure shrink-0 text-[1.375rem] tabular-nums">
                {formatKcal(item.kcal)}
                <span className="ml-1 font-sans text-[0.6875rem] tracking-normal text-[var(--e-ink-3)]">
                  kcal
                </span>
              </span>
            </div>

            {item.ingredients.length > 0 ? (
              <p className="text-[0.8125rem] leading-relaxed text-[var(--e-ink-2)]">
                {item.ingredients.join(" · ")}
              </p>
            ) : null}

            {item.prep ? (
              <p className="text-[0.8125rem] leading-relaxed text-[var(--e-ink-3)] italic">{item.prep}</p>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
                P {item.protein_g} · C {item.carbs_g} · G {item.fat_g} g
              </span>
              <EatButton index={index} compact />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
