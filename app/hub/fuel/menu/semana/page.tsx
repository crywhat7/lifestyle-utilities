import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, ArrowOut } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { fuelClient, loadMenu, loadProfile, loadWeekPlan, MENU_PATH } from "../../data";
import { MissingMigration } from "../../missing";
import { Planner } from "./planner";

export const metadata: Metadata = {
  title: "Menú de la semana · Fuel",
  description: "Qué se come cada día, de lunes a sábado, listo para mandar en PDF.",
};

export default async function PlannerPage() {
  const { supabase, user } = await fuelClient();
  const [{ profile, missing }, menu, plan] = await Promise.all([
    loadProfile(supabase, user.id),
    loadMenu(supabase, user.id),
    loadWeekPlan(supabase, user.id),
  ]);

  const items = menu?.items ?? [];

  return (
    <main className="relative flex flex-1 flex-col gap-7 px-5 pt-[max(1.75rem,env(safe-area-inset-top))]">
      <div aria-hidden="true" className="hearth-glow" />

      <header className="kindle flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={MENU_PATH} className="e-key flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]">
          <ArrowBack className="size-4" />
          Menú
        </NavLink>
        <span className="e-eyebrow">La semana</span>
      </header>

      <section className="kindle" style={{ "--d": "60ms" } as CSSProperties}>
        <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
          Lunes
          <br />
          <em className="text-[var(--e-ink-hot)]">a sábado.</em>
        </h1>
        <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
          Un plato por tiempo, o ninguno. Cuando esté listo, exportalo en PDF
          con cada preparación explicada para quien cocina.
        </p>
      </section>

      {missing ? (
        <MissingMigration />
      ) : plan.missing ? (
        <section className="e-card kindle flex flex-col gap-3 p-5" style={{ "--d": "120ms" } as CSSProperties}>
          <p className="e-eyebrow">Falta un paso</p>
          <p className="text-[0.875rem] leading-relaxed text-[var(--e-ink-2)]">
            Corré{" "}
            <code className="rounded-md bg-[var(--e-sunk)] px-1.5 py-0.5 text-[0.8125rem]">
              supabase/migrations/0016_fuel_week.sql
            </code>{" "}
            en el SQL Editor de Supabase y volvé a abrir esta pantalla.
          </p>
        </section>
      ) : items.length === 0 ? (
        <NavLink
          href={MENU_PATH}
          className="e-key e-key-lit kindle flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
          style={{ "--d": "120ms" } as CSSProperties}
        >
          Primero armá tu menú
          <ArrowOut className="size-4" />
        </NavLink>
      ) : (
        <Planner initial={plan.slots} items={items} target={profile?.target_kcal ?? null} />
      )}
    </main>
  );
}
