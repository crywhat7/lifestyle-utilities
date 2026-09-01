import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { NavLink } from "@/components/nav-link";
import { ArrowBack, Chevron, Sliders, Trash } from "@/components/icons";
import { currentUser } from "@/lib/auth";
import { relativeDate, type DecisionRecord } from "@/lib/decisions";
import {
  formatMoney,
  formatWorkTime,
  presentation,
  riskLevel,
} from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { deleteDecision } from "./actions";
import { PurchaseForm } from "./purchase-form";
import { RateSummary, WorkProfileForm } from "./work-profile-form";

export const metadata: Metadata = {
  title: "Should I Buy It",
  description:
    "Convierte el precio de lo que querés comprar en las horas de vida que te cuesta.",
};

type ProfileRow = {
  monthly_income: number;
  hours_per_day: number;
  days_per_week: number;
  currency: string;
  hourly_rate: number;
};

export default async function ShouldIBuyItPage() {
  // El proxy ya verificó la sesión en esta misma petición: preguntarla otra
  // vez era un viaje entero a Supabase antes de la primera consulta.
  const user = await currentUser();

  if (!user) redirect("/");

  const supabase = await createClient("lifestyle_utilities");

  const [{ data: profileRow }, { data: historyRows }] = await Promise.all([
    supabase
      .from("work_profiles")
      .select("monthly_income,hours_per_day,days_per_week,currency,hourly_rate")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("purchase_decisions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const profile: ProfileRow | null = profileRow
    ? {
        monthly_income: Number(profileRow.monthly_income),
        hours_per_day: Number(profileRow.hours_per_day),
        days_per_week: Number(profileRow.days_per_week),
        currency: String(profileRow.currency),
        hourly_rate: Number(profileRow.hourly_rate) || 0,
      }
    : null;

  const history = (historyRows ?? []) as DecisionRecord[];

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <NavLink
          href="/hub"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Hub
        </NavLink>
        <span className="eyebrow">Herramienta 01</span>
      </header>

      <section className="mt-2">
        <h1
          className="display rise emboss text-[clamp(2.75rem,13vw,3.75rem)]"
          style={{ "--d": "110ms" } as CSSProperties}
        >
          Should I
          <span className="block pl-[0.5em] text-[var(--accent-ink)]">Buy It</span>
        </h1>
        <p
          className="rise mt-5 max-w-[20rem] text-[0.9375rem] leading-relaxed text-[var(--text-2)]"
          style={{ "--d": "190ms" } as CSSProperties}
        >
          Todo lo que comprás se paga con horas de tu vida. Acá ves exactamente
          cuántas.
        </p>
      </section>

      {!profile ? (
        <section
          className="plate rise mt-2 p-5"
          style={{ "--d": "260ms" } as CSSProperties}
        >
          <p className="eyebrow">Paso único</p>
          <h2 className="display mt-3 text-[1.75rem]">¿Cuánto vale tu hora?</h2>
          <p className="mt-2 mb-6 text-[0.875rem] leading-relaxed text-[var(--text-2)]">
            Con tu ingreso y tu jornada calculamos la tarifa. Se guarda una vez
            y la podés cambiar cuando quieras.
          </p>
          <WorkProfileForm onboarding />
        </section>
      ) : (
        <>
          <section
            className="plate rise p-5"
            style={{ "--d": "260ms" } as CSSProperties}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Tu hora vale</p>
                <div className="mt-2">
                  <RateSummary profile={profile} />
                </div>
              </div>
              <span className="groove flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]">
                <Sliders className="size-4" />
              </span>
            </div>

            <details className="group mt-4 border-t border-[var(--edge)] pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[0.8125rem] text-[var(--text-2)] marker:hidden">
                Ajustar ingreso y jornada
                <span className="text-[var(--text-3)] transition-transform duration-500 [transition-timing-function:var(--ease-expo)] group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-5">
                <WorkProfileForm initial={profile} />
              </div>
            </details>
          </section>

          <div className="rise" style={{ "--d": "340ms" } as CSSProperties}>
            <PurchaseForm currency={profile.currency} />
          </div>
        </>
      )}

      {history.length > 0 && profile ? (
        <section className="rise mt-3" style={{ "--d": "410ms" } as CSSProperties}>
          <div className="mb-1 flex items-baseline justify-between px-1">
            <h2 className="eyebrow">Historial</h2>
            <span className="text-[0.6875rem] text-[var(--text-3)] tabular-nums">
              {history.length}
            </span>
          </div>
          <p className="mb-3 px-1 text-[0.75rem] text-[var(--text-3)]">
            Tocá cualquiera para volver a ver el análisis completo.
          </p>

          <ul className="flex flex-col gap-2">
            {history.map((decision) => (
              <HistoryRow
                key={decision.id}
                decision={decision}
                hoursPerDay={profile.hours_per_day}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function HistoryRow({
  decision,
  hoursPerDay,
}: {
  decision: DecisionRecord;
  hoursPerDay: number;
}) {
  const share =
    decision.income_share != null ? Number(decision.income_share) : null;
  const copy = presentation(
    decision.verdict ?? "think",
    share != null ? riskLevel(share) : "low"
  );
  const hours = decision.hours_cost != null ? Number(decision.hours_cost) : null;
  const price = decision.price != null ? Number(decision.price) : null;
  const pending = decision.ai_status === "pending";

  return (
    <li className="groove flex items-center gap-1 overflow-hidden">
      <NavLink
        href={`/hub/should-i-buy-it/${decision.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 p-4 transition-opacity duration-300 [transition-timing-function:var(--ease-quart)] active:opacity-70"
      >
        <span
          aria-hidden="true"
          className={`h-9 w-1 shrink-0 rounded-full ${pending ? "pulse-dot" : ""}`}
          style={{
            background: copy.color,
            boxShadow: `0 0 10px ${copy.color}66`,
          }}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium">
            {decision.product_name}
          </span>
          <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--text-3)]">
            {price != null
              ? `${formatMoney(price, decision.currency)} · `
              : "Sin precio · "}
            <span style={{ color: copy.color }}>{copy.label}</span> ·{" "}
            {relativeDate(decision.created_at)}
          </span>
        </span>

        <span className="display shrink-0 text-[1.0625rem] tabular-nums text-[var(--text-2)]">
          {hours != null ? formatWorkTime(hours, hoursPerDay) : "—"}
        </span>

        <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--text-3)]" />
      </NavLink>

      <form action={deleteDecision} className="pr-3">
        <input type="hidden" name="id" value={decision.id} />
        <button
          type="submit"
          aria-label={`Borrar ${decision.product_name} del historial`}
          className="flex size-8 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--danger)]"
        >
          <Trash className="size-4" />
        </button>
      </form>
    </li>
  );
}
