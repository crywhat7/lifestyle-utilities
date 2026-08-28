import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { relativeDate, type DecisionRecord } from "@/lib/decisions";
import { presentation, riskLevel } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { DecisionView } from "../decision-view";
import { Enricher } from "./enricher";

export const metadata: Metadata = {
  title: "Análisis de compra",
};

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient("lifestyle_utilities");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const [{ data: row }, { data: profileRow }] = await Promise.all([
    supabase
      .from("purchase_decisions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("work_profiles")
      .select("monthly_income,hours_per_day,days_per_week,currency,hourly_rate")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!row || !profileRow) notFound();

  const decision = row as DecisionRecord;
  const profile = {
    monthly_income: Number(profileRow.monthly_income),
    hours_per_day: Number(profileRow.hours_per_day),
    hourly_rate: Number(profileRow.hourly_rate) || 0,
    currency: String(profileRow.currency),
  };

  // La atmósfera de la pantalla entera responde al veredicto.
  const share =
    decision.income_share != null ? Number(decision.income_share) : null;
  const tone =
    share != null
      ? presentation(decision.verdict ?? "think", riskLevel(share)).color
      : "#c6f24e";

  return (
    <main className="relative flex flex-1 flex-col gap-4 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 55% at 50% 0%, ${tone}1c 0%, transparent 62%)`,
        }}
      />

      <header
        className="fade flex items-center justify-between gap-3"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <Link
          href="/hub/should-i-buy-it"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Otra compra
        </Link>
        <span className="eyebrow shrink-0">
          {relativeDate(decision.created_at)}
        </span>
      </header>

      <div
        className="rise flex flex-1 flex-col"
        style={{ "--d": "100ms" } as CSSProperties}
      >
        <DecisionView decision={decision} profile={profile} />
      </div>

      {decision.ai_status === "pending" ? <Enricher id={decision.id} /> : null}
    </main>
  );
}
