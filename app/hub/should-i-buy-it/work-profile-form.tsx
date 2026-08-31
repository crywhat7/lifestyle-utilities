"use client";

import { useActionState } from "react";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatMoney,
  hourlyRate,
} from "@/lib/money";
import { saveWorkProfile, type ProfileState } from "./actions";

type Props = {
  initial?: {
    monthly_income: number;
    hours_per_day: number;
    days_per_week: number;
    currency: string;
  } | null;
  onboarding?: boolean;
};

const INITIAL: ProfileState = { status: "idle" };

export function WorkProfileForm({ initial, onboarding = false }: Props) {
  const [state, formAction, pending] = useActionState(
    saveWorkProfile,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="field-label" htmlFor="monthly_income">
          Cuánto ganás al mes
        </label>
        <input
          id="monthly_income"
          name="monthly_income"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          required
          defaultValue={initial?.monthly_income ?? ""}
          placeholder="18000"
          className="field text-[1.25rem] tabular-nums"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="currency">
          Moneda
        </label>
        <select
          id="currency"
          name="currency"
          defaultValue={initial?.currency ?? DEFAULT_CURRENCY}
          className="field"
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="hours_per_day">
            Horas al día
          </label>
          <input
            id="hours_per_day"
            name="hours_per_day"
            type="number"
            inputMode="decimal"
            min="1"
            max="24"
            step="0.5"
            required
            defaultValue={initial?.hours_per_day ?? 8}
            className="field tabular-nums"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="days_per_week">
            Días a la semana
          </label>
          <input
            id="days_per_week"
            name="days_per_week"
            type="number"
            inputMode="decimal"
            min="1"
            max="7"
            step="0.5"
            required
            defaultValue={initial?.days_per_week ?? 5}
            className="field tabular-nums"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="key key-accent mt-1 h-14 w-full text-[1rem] font-semibold disabled:cursor-progress disabled:opacity-80"
      >
        {pending
          ? "Guardando…"
          : onboarding
            ? "Calcular mi tarifa"
            : "Guardar cambios"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      {state.status === "saved" ? (
        <p className="text-center text-[0.8125rem] text-[var(--accent-ink)]">
          Listo, tarifa actualizada.
        </p>
      ) : null}
    </form>
  );
}

export function RateSummary({
  profile,
}: {
  profile: {
    monthly_income: number;
    hours_per_day: number;
    days_per_week: number;
    currency: string;
    hourly_rate: number;
  };
}) {
  const rate = profile.hourly_rate || hourlyRate(profile);

  return (
    <span className="flex items-baseline gap-2">
      <span className="display text-[1.5rem] tabular-nums text-[var(--accent-ink)]">
        {formatMoney(rate, profile.currency)}
      </span>
      <span className="text-[0.75rem] text-[var(--text-3)]">
        por hora · {profile.hours_per_day}h × {profile.days_per_week}d
      </span>
    </span>
  );
}
