import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { FUEL_PATH, fuelClient, loadDishes, today } from "../data";
import { DishBrowser } from "./dish-browser";

export const metadata: Metadata = {
  title: "Tus platos · Fuel",
  description: "Todo lo que registraste alguna vez, para volver a sumarlo con un toque.",
};

export default async function DishesPage() {
  const { supabase, user } = await fuelClient();
  const dishes = await loadDishes(supabase, user.id);
  const meals = dishes.reduce((sum, dish) => sum + dish.count, 0);

  return (
    <main className="relative flex flex-1 flex-col gap-6 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div aria-hidden="true" className="hearth-glow" />

      <header className="kindle flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={FUEL_PATH} className="e-key flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]">
          <ArrowBack className="size-4" />
          Fuel
        </NavLink>
        <span className="e-eyebrow">Tus platos</span>
      </header>

      <section className="kindle" style={{ "--d": "60ms" } as CSSProperties}>
        <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
          Lo de
          <br />
          <em className="text-[var(--e-ink-hot)]">siempre.</em>
        </h1>
        <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
          {dishes.length === 0
            ? "Todavía no registraste nada. Cuando lo hagas, cada plato queda acá para repetirlo con un toque."
            : `${dishes.length} ${dishes.length === 1 ? "plato distinto" : "platos distintos"} en ${meals} ${
                meals === 1 ? "registro" : "registros"
              }. Tocá el que comiste y se suma a hoy tal cual la última vez.`}
        </p>
      </section>

      {dishes.length > 0 ? <DishBrowser dishes={dishes} today={today()} /> : null}
    </main>
  );
}
