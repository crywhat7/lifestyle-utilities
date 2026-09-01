import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { NavLink } from "@/components/nav-link";
import { ArrowBack } from "@/components/icons";
import { ThemeSwitch } from "@/components/theme-switch";
import { isAdmin } from "@/lib/admin";
import { formatMoney } from "@/lib/money";
import { WorkProfileForm } from "../../should-i-buy-it/work-profile-form";
import {
  loadCategories,
  loadFixedExpenses,
  loadPaySchedules,
  loadPocketProfile,
  pocketClient,
} from "../data";
import {
  CustomCategories,
  FixedExpenses,
  PaySchedules,
  Stagger,
  TrackingSince,
} from "./forms";
import { PushToggle } from "./push-toggle";

export const metadata: Metadata = {
  title: "Ajustes · My Pocket",
  description: "Fechas de pago, gastos contemplados y categorías propias.",
};

export default async function PocketSettingsPage() {
  const { supabase, user } = await pocketClient();

  // Las cuatro consultas de la pantalla, en una sola ida y vuelta.
  const [
    { profile, since, accountSince, sinceIsCustom },
    categories,
    schedules,
    fixedExpenses,
  ] = await Promise.all([
    loadPocketProfile(supabase, user.id),
    loadCategories(supabase),
    loadPaySchedules(supabase, user.id),
    loadFixedExpenses(supabase, user.id),
  ]);

  if (!profile) redirect("/hub/my-pocket");

  const mine = categories.filter((category) => category.user_id === user.id);

  // Si ya hay fechas configuradas, el sueldo se reparte entre una más.
  const suggested =
    Math.round((profile.monthly_income / (schedules.length + 1)) * 100) / 100;

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <NavLink
          href="/hub/my-pocket"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Pocket
        </NavLink>
        <span className="eyebrow">Ajustes</span>
      </header>

      <section className="mt-2 mb-1">
        <h1
          className="display rise emboss text-[clamp(2.25rem,11vw,3rem)]"
          style={{ "--d": "110ms" } as CSSProperties}
        >
          Cómo entra
          <span className="block text-[var(--accent-ink)]">y cómo sale</span>
        </h1>
        <p
          className="rise mt-4 max-w-[21rem] text-[0.875rem] leading-relaxed text-[var(--text-2)]"
          style={{ "--d": "170ms" } as CSSProperties}
        >
          Tu moneda base es {profile.currency} y tu ingreso mensual{" "}
          {formatMoney(profile.monthly_income, profile.currency)}. Todo lo que
          registres en otra moneda se convierte a esa.
        </p>
      </section>

      <Stagger delay={400}>
        <PaySchedules
          schedules={schedules}
          baseCurrency={profile.currency}
          suggested={suggested}
        />
      </Stagger>

      <Stagger delay={480}>
        <FixedExpenses
          expenses={fixedExpenses}
          categories={categories}
          baseCurrency={profile.currency}
        />
      </Stagger>

      <Stagger delay={520}>
        <TrackingSince
          since={since}
          accountSince={accountSince}
          custom={sinceIsCustom}
        />
      </Stagger>

      <Stagger delay={560}>
        <CustomCategories mine={mine} />
      </Stagger>

      <Stagger delay={600}>
        <PushToggle admin={isAdmin(user.email)} />
      </Stagger>

      <Stagger delay={620}>
        <section className="plate flex items-center gap-4 p-5">
          <span className="min-w-0 flex-1">
            <p className="eyebrow">Cómo se ve</p>
            <h2 className="display mt-2 text-[1.625rem]">Tema</h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
              Automático sigue lo que tenga puesto tu teléfono.
            </p>
          </span>
          <ThemeSwitch />
        </section>
      </Stagger>

      <Stagger delay={640}>
        <section className="plate p-5">
          <p className="eyebrow">Base de todo</p>
          <h2 className="display mt-2 text-[1.625rem]">Ingreso y jornada</h2>
          <p className="mt-2 mb-6 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
            Lo mismo que usa Should I Buy It. Cambiarlo acá lo cambia allá.
          </p>
          <WorkProfileForm
            initial={{
              monthly_income: profile.monthly_income,
              hours_per_day: profile.hours_per_day,
              days_per_week: profile.days_per_week,
              currency: profile.currency,
            }}
          />
        </section>
      </Stagger>
    </main>
  );
}
