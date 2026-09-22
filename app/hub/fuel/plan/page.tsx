import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { TIMEZONE } from "@/lib/cron";
import { formatKcal, GOAL_LABEL, type FuelProfile } from "@/lib/fuel";
import { FUEL_PATH, fuelClient, loadProfile } from "../data";
import { MissingMigration } from "../missing";
import { FuelAlerts } from "./fuel-alerts";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = {
  title: "Mi plan · Fuel",
  description: "Tu meta diaria de calorías y macros, armada por IA con tus datos.",
};

// Pedirle el plan a la IA puede tardar: que la acción no muera en el borde.
export const maxDuration = 60;

const DAY = new Intl.DateTimeFormat("es-HN", { timeZone: TIMEZONE, day: "numeric", month: "short" });

export default async function PlanPage() {
  const { supabase, user } = await fuelClient();
  const { profile, missing } = await loadProfile(supabase, user.id);
  const planned = Boolean(profile?.target_kcal);

  return (
    <main className="relative flex flex-1 flex-col gap-8 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div aria-hidden="true" className="hearth-glow" />

      <header className="kindle flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href={FUEL_PATH} className="e-key flex h-10 items-center gap-2 pr-4 pl-3 text-[0.8125rem]">
          <ArrowBack className="size-4" />
          Fuel
        </NavLink>
        <span className="e-eyebrow">Mi plan</span>
      </header>

      {missing ? (
        <MissingMigration />
      ) : (
        <>
          {planned && profile ? (
            <PlanView profile={profile} />
          ) : (
            <section className="kindle" style={{ "--d": "80ms" } as CSSProperties}>
              <h1 className="e-display text-[clamp(3rem,15vw,4.25rem)]">
                Tu cuerpo,
                <br />
                <em className="text-[var(--e-ink-hot)]">tu número.</em>
              </h1>
              <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
                Con estos datos la IA calcula tu meta diaria y cómo repartirla en
                proteína, carbohidratos y grasa.
              </p>
            </section>
          )}

          <section className="flex flex-col gap-4">
            {planned ? (
              <h2 className="e-display kindle text-[1.75rem]" style={{ "--d": "380ms" } as CSSProperties}>
                Tus datos
              </h2>
            ) : null}
            <PlanForm profile={profile} delay={planned ? 440 : 160} />
          </section>

          {planned && profile ? <FuelAlerts remind={profile.remind} delay={520} /> : null}
        </>
      )}
    </main>
  );
}

/**
 * El plan, dicho en grande.
 *
 * La meta ocupa la pantalla porque es lo único que hay que recordar; las
 * macros van en una sola barra partida —se lee la proporción de un vistazo—
 * y los consejos numerados como una receta, no como viñetas de folleto.
 */
function PlanView({ profile }: { profile: FuelProfile }) {
  const target = profile.target_kcal ?? 0;
  const macros = [
    { key: "protein", label: "Proteína", grams: profile.protein_g ?? 0, kcal: (profile.protein_g ?? 0) * 4 },
    { key: "carbs", label: "Carbohidratos", grams: profile.carbs_g ?? 0, kcal: (profile.carbs_g ?? 0) * 4 },
    { key: "fat", label: "Grasa", grams: profile.fat_g ?? 0, kcal: (profile.fat_g ?? 0) * 9 },
  ];
  const sum = macros.reduce((total, macro) => total + macro.kcal, 0) || 1;
  const shades = ["var(--e-deep)", "var(--e-lit)", "var(--e-core)"];

  return (
    <section className="flex flex-col gap-6">
      <div className="kindle" style={{ "--d": "80ms" } as CSSProperties}>
        <p className="e-eyebrow">Para {GOAL_LABEL[profile.goal].verb}</p>
        <p className="mt-4 flex items-end gap-3">
          <span className="e-figure text-[clamp(5.5rem,30vw,8.5rem)]">{formatKcal(target)}</span>
          <span className="mb-3 text-[0.875rem] leading-tight text-[var(--e-ink-3)]">
            kcal
            <br />
            por día
          </span>
        </p>
      </div>

      <div className="kindle flex flex-col gap-3" style={{ "--d": "160ms" } as CSSProperties}>
        <div className="flex h-3 gap-1 overflow-hidden rounded-full">
          {macros.map((macro, index) => (
            <span
              key={macro.key}
              className="h-full rounded-full"
              style={{ width: `${(macro.kcal / sum) * 100}%`, background: shades[index] }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {macros.map((macro, index) => (
            <div key={macro.key}>
              <span className="flex items-center gap-1.5 text-[0.75rem] text-[var(--e-ink-3)]">
                <span className="size-2 rounded-full" style={{ background: shades[index] }} />
                {macro.label}
              </span>
              <span className="e-figure mt-1.5 block text-[1.75rem]">
                {macro.grams}
                <span className="ml-0.5 font-sans text-[0.8125rem] tracking-normal text-[var(--e-ink-3)]">g</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {profile.plan_summary ? (
        <p
          className="kindle text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]"
          style={{ "--d": "220ms" } as CSSProperties}
        >
          {profile.plan_summary}
        </p>
      ) : null}

      {profile.plan_tips.length > 0 ? (
        <ol className="e-card kindle flex flex-col" style={{ "--d": "280ms" } as CSSProperties}>
          {profile.plan_tips.map((tip, index) => (
            <li
              key={tip}
              className={`flex gap-4 px-5 py-4 ${index > 0 ? "border-t border-[var(--e-hair)]" : ""}`}
            >
              <span className="e-figure pt-0.5 text-[1.25rem] text-[var(--e-ink-hot)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-[var(--e-ink-2)]">{tip}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="kindle text-[0.75rem] text-[var(--e-ink-3)]" style={{ "--d": "320ms" } as CSSProperties}>
        {profile.plan_model
          ? `Armado por IA${profile.planned_at ? ` · ${DAY.format(new Date(profile.planned_at))}` : ""}. Es una guía, no una receta médica.`
          : "Calculado con Mifflin-St Jeor porque la IA no contestó. Recalculalo cuando quieras."}
      </p>
    </section>
  );
}
