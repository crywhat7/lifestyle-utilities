"use client";

import { useActionState } from "react";
import { Search, Spark } from "@/components/icons";
import type { DecisionRecord } from "@/lib/decisions";
import { SIZE_LABEL, TYPE_LABEL, formatMoney } from "@/lib/money";
import { analyze, type AnalyzeState } from "./actions";
import { TimeReadout } from "./time-readout";

const INITIAL: AnalyzeState = { status: "idle" };

export function PurchaseConsole({ currency }: { currency: string }) {
  const [state, formAction, pending] = useActionState(analyze, INITIAL);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="plate relative overflow-hidden p-5">
        <label className="field-label" htmlFor="query">
          ¿Qué querés comprar?
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[var(--text-3)]" />
          <input
            id="query"
            name="query"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="off"
            placeholder="AirPods Pro, una cena, una laptop…"
            className="field pl-11"
          />
        </div>

        <div className="mt-4">
          <label className="field-label" htmlFor="price">
            Precio · opcional
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[0.8125rem] text-[var(--text-3)]">
              {currency}
            </span>
            <input
              id="price"
              name="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Si lo dejás vacío, lo estimamos"
              className="field pl-[3.75rem] tabular-nums"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="key key-accent mt-5 h-14 w-full text-[1rem] font-semibold disabled:cursor-progress disabled:opacity-80"
        >
          {pending ? "Sacando cuentas…" : "¿Debería comprarlo?"}
        </button>

        {state.status === "error" ? (
          <p
            role="alert"
            className="mt-4 text-center text-[0.8125rem] text-[var(--danger)]"
          >
            {state.error}
          </p>
        ) : null}
      </form>

      {pending ? <Thinking /> : null}

      {!pending && state.status === "ok" && state.decision ? (
        <DecisionResult decision={state.decision} />
      ) : null}
    </div>
  );
}

/** Estado de carga diseñado: el medidor late mientras la IA piensa. */
function Thinking() {
  return (
    <section className="plate fade p-6" aria-live="polite">
      <p className="eyebrow">Convirtiendo precio en tiempo</p>
      <div className="mt-5 flex items-end gap-[5px]">
        {[38, 62, 46, 80, 54, 70, 44].map((height, index) => (
          <span
            key={index}
            className="w-2 rounded-full bg-[var(--accent)]/40"
            style={{
              height: `${height * 0.5}px`,
              animation: `breathe 1.4s var(--ease-quart) ${index * 90}ms infinite`,
            }}
          />
        ))}
      </div>
      <p className="mt-5 text-[0.8125rem] text-[var(--text-3)]">
        Buscando el producto, estimando el precio y midiendo cuántas horas te
        cuesta.
      </p>
    </section>
  );
}

export function DecisionResult({ decision }: { decision: DecisionRecord }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Lo que elegiste */}
      <section className="groove flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="eyebrow">Tu elección</p>
          <p className="mt-1.5 truncate text-[1.0625rem] font-medium">
            {decision.product_name}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {decision.category ? (
              <span className="chip">{decision.category}</span>
            ) : null}
            {decision.purchase_type ? (
              <span className="chip">{TYPE_LABEL[decision.purchase_type]}</span>
            ) : null}
            {decision.size_bucket ? (
              <span className="chip">{SIZE_LABEL[decision.size_bucket]}</span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="display text-[1.5rem] tabular-nums">
            {formatMoney(Number(decision.price), decision.currency)}
          </p>
          {decision.price_is_estimated ? (
            <p className="mt-1 text-[0.6875rem] tracking-[0.12em] text-[var(--text-3)] uppercase">
              Estimado
            </p>
          ) : null}
        </div>
      </section>

      <TimeReadout
        hours={Number(decision.hours_cost)}
        workDays={Number(decision.work_days_cost)}
        incomeShare={Number(decision.income_share)}
        verdict={decision.verdict}
      />

      {decision.ai_opinion ? (
        <section className="plate p-5">
          <p className="flex items-center gap-2 text-[0.6875rem] tracking-[0.18em] text-[var(--text-3)] uppercase">
            <Spark className="size-3.5 text-[var(--accent)]" />
            Segunda opinión
          </p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--text-1)]">
            {decision.ai_opinion}
          </p>
        </section>
      ) : null}

      {decision.price_is_estimated ? (
        <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          El precio es una estimación de la IA, no un precio de tienda.
          Verificalo antes de comprar.
        </p>
      ) : null}
    </div>
  );
}
