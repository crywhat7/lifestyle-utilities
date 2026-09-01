import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { cleanClient, loadHabits } from "../data";
import { HabitManager } from "./habit-manager";
import { PushSwitch } from "./push-switch";

export const metadata: Metadata = {
  title: "Hábitos · Clean Daily",
  description: "Qué querés sostener, qué querés contar y cada cuánto aparece.",
};

export default async function HabitsPage() {
  const { supabase, user } = await cleanClient();
  const habits = await loadHabits(supabase, user.id);

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

      <section className="settle" style={{ "--d": "120ms" } as CSSProperties}>
        <p className="glass-eyebrow">Mis hábitos</p>
        <h1 className="glass-display mt-3 text-[clamp(2.5rem,13vw,3.5rem)]">
          La regla, no la deuda
        </h1>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--g-ink-2)]">
          Acá se define qué aparece y cada cuánto. Nada de lo que escribas
          genera una tarea pendiente: si un día no toca, ese día no existe.
        </p>
      </section>

      <HabitManager habits={habits} />

      {/* Al final y no arriba: primero se escribe la intención, después se
          decide si además suena. */}
      <PushSwitch delay={420} />
    </main>
  );
}
