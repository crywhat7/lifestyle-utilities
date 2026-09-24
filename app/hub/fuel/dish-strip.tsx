import type { CSSProperties } from "react";
import { ArrowOut } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { DISHES_PATH, type ShownDish } from "./data";
import { DishCard } from "./dish-card";

/**
 * "Lo de siempre": los platos que más comés a esta hora, a un toque.
 *
 * Vive justo debajo del fogón porque es el atajo del atajo: si lo que tenés
 * enfrente es la avena de todas las mañanas, no hace falta sacarle foto. La
 * franja se desliza de lado y termina en la puerta al historial completo.
 */
export function DishStrip({ dishes, delay = 0 }: { dishes: ShownDish[]; delay?: number }) {
  if (dishes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="kindle flex items-baseline justify-between" style={{ "--d": `${delay}ms` } as CSSProperties}>
        <h2 className="e-display text-[1.5rem]">
          Lo de <em className="text-[var(--e-ink-hot)]">siempre</em>
        </h2>
        <span className="text-[0.75rem] text-[var(--e-ink-3)]">tocá el que comiste</span>
      </div>

      <ul className="dish-strip -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {dishes.map((dish, index) => (
          <DishCard key={dish.key} dish={dish} delay={delay + 60 + index * 50} />
        ))}
        <li className="dish-card kindle" style={{ "--d": `${delay + 60 + dishes.length * 50}ms` } as CSSProperties}>
          <NavLink href={DISHES_PATH} className="flex h-full min-h-[11.5rem] flex-col justify-between p-3.5">
            <span className="e-display text-[1.25rem] leading-tight">
              Todos
              <br />
              tus platos
            </span>
            <span className="e-key e-key-lit grid size-10 place-items-center">
              <ArrowOut className="size-4" />
            </span>
          </NavLink>
        </li>
      </ul>
    </section>
  );
}
