"use client";

import { useState } from "react";
import { Check } from "@/components/icons";
import { HIGH_RISK, formatMoney, formatWorkTime } from "@/lib/money";

const PLANS = [3, 6, 12, 18] as const;

const QUESTIONS = [
  "¿Tenés ahorros que cubran esto sin tocar el mes?",
  "¿Podés seguir pagando tus gastos fijos después de comprarlo?",
  "¿Lo vas a seguir queriendo dentro de 30 días?",
];

type Props = {
  price: number;
  currency: string;
  monthlyIncome: number;
  hourlyRate: number;
  hoursPerDay: number;
};

/**
 * Arriba del 35% del ingreso, un chip naranja que dice "pensalo" no alcanza.
 * Acá se pregunta lo que hay que preguntarse, y se simula la cuota real.
 */
export function RiskPanel({
  price,
  currency,
  monthlyIncome,
  hourlyRate,
  hoursPerDay,
}: Props) {
  const [months, setMonths] = useState<number>(6);
  const [answered, setAnswered] = useState<boolean[]>([false, false, false]);

  const installment = price / months;
  const installmentShare = monthlyIncome > 0 ? installment / monthlyIncome : 0;
  const installmentHours = hourlyRate > 0 ? installment / hourlyRate : 0;
  const monthsOfIncome = monthlyIncome > 0 ? price / monthlyIncome : 0;
  const allClear = answered.every(Boolean);

  function toggle(index: number) {
    setAnswered((current) =>
      current.map((value, i) => (i === index ? !value : value))
    );
  }

  return (
    <section
      className="plate relative overflow-hidden p-5"
      style={{ borderColor: `${HIGH_RISK.color}3d` }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -left-16 size-52 rounded-full opacity-50 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${HIGH_RISK.color}2e, transparent 70%)`,
        }}
      />

      <p
        className="relative text-[0.6875rem] tracking-[0.2em] uppercase"
        style={{ color: HIGH_RISK.color }}
      >
        Antes de decidir
      </p>

      <h2 className="display relative mt-3 text-[1.625rem]">
        Esto es {monthsOfIncome >= 1 ? "más de un mes" : "más de un tercio"} de
        tu ingreso.
      </h2>

      <p className="relative mt-2 text-[0.875rem] leading-relaxed text-[var(--text-2)]">
        {monthsOfIncome >= 1
          ? `Equivale a ${monthsOfIncome.toFixed(1)} meses completos de trabajo.`
          : "Una compra de este tamaño se decide con datos, no con ganas."}
      </p>

      {/* Las tres preguntas */}
      <ul className="relative mt-5 flex flex-col gap-2">
        {QUESTIONS.map((question, index) => (
          <li key={question}>
            <label className="groove flex cursor-pointer items-start gap-3 p-3.5">
              <input
                type="checkbox"
                checked={answered[index]}
                onChange={() => toggle(index)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="mt-px flex size-5 shrink-0 items-center justify-center rounded-[7px] border border-[var(--edge-strong)] bg-[var(--sunk-1)] text-transparent transition-colors duration-300 [transition-timing-function:var(--ease-quart)] peer-checked:border-[var(--accent)]/60 peer-checked:bg-[var(--accent)] peer-checked:text-[var(--on-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]"
              >
                <Check className="size-3" />
              </span>
              <span className="text-[0.875rem] leading-snug text-[var(--text-2)] peer-checked:text-[var(--text-1)]">
                {question}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/* Simulador de cuotas */}
      <div className="relative mt-5 border-t border-[var(--edge)] pt-5">
        <p className="field-label mb-3">Si lo pagás en cuotas</p>

        <div
          role="group"
          aria-label="Plazo en meses"
          className="groove flex gap-1 p-1"
        >
          {PLANS.map((plan) => {
            const active = plan === months;
            return (
              <button
                key={plan}
                type="button"
                onClick={() => setMonths(plan)}
                aria-pressed={active}
                className={`flex-1 rounded-[14px] py-2.5 text-[0.8125rem] tabular-nums transition-all duration-400 [transition-timing-function:var(--ease-expo)] ${
                  active
                    ? "key text-[var(--text-1)]"
                    : "text-[var(--text-3)] active:text-[var(--text-2)]"
                }`}
              >
                {plan}m
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="display text-[2rem] tabular-nums">
              {formatMoney(installment, currency)}
            </p>
            <p className="mt-1 text-[0.75rem] text-[var(--text-3)]">
              cada mes durante {months} meses
            </p>
          </div>
          <div className="text-right text-[0.75rem] text-[var(--text-3)]">
            <p>
              <span className="text-[var(--text-2)] tabular-nums">
                {Math.round(installmentShare * 100)}%
              </span>{" "}
              de tu ingreso
            </p>
            <p className="mt-1">
              <span className="text-[var(--text-2)] tabular-nums">
                {formatWorkTime(installmentHours, hoursPerDay)}
              </span>{" "}
              de trabajo al mes
            </p>
          </div>
        </div>

        <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          Sin intereses. Con intereses reales, sumale lo que cobre tu banco.
        </p>
      </div>

      <p
        className="relative mt-5 border-t border-[var(--edge)] pt-4 text-[0.8125rem] leading-relaxed"
        style={{ color: allClear ? "var(--accent-ink)" : HIGH_RISK.color }}
      >
        {allClear
          ? "Con las tres cubiertas, ya no es un impulso: es una decisión tomada."
          : "Mientras quede una sin marcar, no lo compres hoy."}
      </p>
    </section>
  );
}
