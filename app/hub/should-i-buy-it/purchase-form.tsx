"use client";

import { useActionState } from "react";
import { Search } from "@/components/icons";
import { CURRENCIES } from "@/lib/money";
import { startDecision, type StartState } from "./actions";

const INITIAL: StartState = { status: "idle" };

export function PurchaseForm({ currency }: { currency: string }) {
  const [state, formAction, pending] = useActionState(startDecision, INITIAL);

  return (
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
        <div className="flex gap-2">
          <input
            id="price"
            name="price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Si lo dejás vacío, lo estimamos"
            className="field min-w-0 flex-1 tabular-nums"
          />
          <select
            name="purchase_currency"
            aria-label="Moneda de la compra"
            defaultValue={currency}
            className="field w-[6.25rem] shrink-0 text-[0.9375rem]"
          >
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          Si comprás en otra moneda la convertimos a {currency} al cambio del
          día.
        </p>
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
  );
}
