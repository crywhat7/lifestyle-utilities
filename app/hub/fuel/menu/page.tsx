import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, ArrowOut, Chevron } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { minutesIn, TIMEZONE } from "@/lib/cron";
import { courseAt, formatKcal } from "@/lib/fuel";
import { FUEL_PATH, fuelClient, loadMenu, loadProfile, PLAN_PATH } from "../data";
import { MissingMigration } from "../missing";
import { MenuBoard } from "./menu-board";
import { Pantry } from "./pantry";

export const metadata: Metadata = {
  title: "Menú · Fuel",
  description: "Cinco desayunos, cinco almuerzos, cinco cenas y diez aperitivos con lo que tenés en casa.",
};

// Veinticinco platos de una sola vez: la IA se toma su tiempo.
export const maxDuration = 60;

const DAY = new Intl.DateTimeFormat("es-HN", { timeZone: TIMEZONE, day: "numeric", month: "long" });

export default async function MenuPage() {
  const { supabase, user } = await fuelClient();
  const [{ profile, missing }, menu] = await Promise.all([
    loadProfile(supabase, user.id),
    loadMenu(supabase, user.id),
  ]);

  const hasMenu = Boolean(menu && menu.items.length > 0);

  return (
    <main className="relative flex flex-1 flex-col gap-8 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div aria-hidden="true" className="hearth-glow" />

      <header className="kindle flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={FUEL_PATH} className="e-key flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]">
          <ArrowBack className="size-4" />
          Fuel
        </NavLink>
        <span className="e-eyebrow">Menú</span>
      </header>

      {missing ? (
        <MissingMigration />
      ) : !profile?.target_kcal ? (
        <section className="kindle flex flex-col gap-5" style={{ "--d": "80ms" } as CSSProperties}>
          <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
            El menú se mide
            <br />
            <em className="text-[var(--e-ink-hot)]">con tu plan.</em>
          </h1>
          <p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
            Sin una meta diaria no hay cómo dimensionar los platos. Armala
            primero; toma un minuto.
          </p>
          <NavLink
            href={PLAN_PATH}
            className="e-key e-key-lit flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
          >
            Armar mi plan
            <ArrowOut className="size-4" />
          </NavLink>
        </section>
      ) : hasMenu && menu ? (
        <>
          <section className="kindle" style={{ "--d": "60ms" } as CSSProperties}>
            <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
              La carta
              <br />
              <em className="text-[var(--e-ink-hot)]">de la semana.</em>
            </h1>
            <p className="mt-4 text-[0.8125rem] text-[var(--e-ink-3)]">
              Medida para {formatKcal(menu.target ?? profile.target_kcal)} kcal diarias · armada el{" "}
              {DAY.format(new Date(menu.createdAt))}
            </p>
          </section>

          <MenuBoard items={menu.items} initial={courseAt(minutesIn(TIMEZONE))} />

          {/*
            Rehacer el menú es lo menos frecuente de la pantalla, así que la
            despensa se pliega abajo en vez de empujar la carta.
          */}
          <details className="group e-card kindle p-5" style={{ "--d": "520ms" } as CSSProperties}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span>
                <span className="e-display block text-[1.375rem]">Tu despensa</span>
                <span className="mt-1 block text-[0.75rem] text-[var(--e-ink-3)]">
                  {profile.pantry.length} ingredientes · cambialos y rehacé el menú
                </span>
              </span>
              <Chevron className="size-4 shrink-0 text-[var(--e-ink-3)] transition-transform duration-300 group-open:rotate-180" />
            </summary>
            <div className="mt-6">
              <Pantry selected={profile.pantry} hasMenu />
            </div>
          </details>
        </>
      ) : (
        <>
          <section className="kindle" style={{ "--d": "60ms" } as CSSProperties}>
            <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
              ¿Qué hay
              <br />
              <em className="text-[var(--e-ink-hot)]">en tu cocina?</em>
            </h1>
            <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
              Marcá lo que tenés o podés comprar. La IA arma 5 desayunos, 5
              almuerzos, 5 cenas y 10 aperitivos solo con eso.
            </p>
          </section>
          <Pantry selected={profile.pantry} hasMenu={false} delay={140} />
        </>
      )}
    </main>
  );
}
