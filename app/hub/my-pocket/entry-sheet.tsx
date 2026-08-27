"use client";

import { useActionState, useEffect, useState, type CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowIn, ArrowUpRight, Cross, Repeat } from "@/components/icons";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { isoDate, type FixedExpense, type PocketCategory } from "@/lib/pocket";
import { createTransaction, type FormState } from "./actions";
import { CategoryGrid } from "./category-grid";

type Kind = "income" | "expense";

const INITIAL: FormState = { status: "idle" };

/* -------------------------------------------------------------------------- */
/* Muelle flotante                                                             */
/* -------------------------------------------------------------------------- */

export function PocketDock({
  categories,
  fixedExpenses,
  baseCurrency,
}: {
  categories: PocketCategory[];
  fixedExpenses: FixedExpense[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState<Kind | null>(null);

  return (
    <>
      <div className="dock">
        <div
          className="rise flex gap-3"
          style={{ "--d": "820ms" } as CSSProperties}
        >
          <button
            type="button"
            onClick={() => setOpen("income")}
            className="key flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium"
          >
            <ArrowIn className="size-[1.125rem] text-[var(--accent)]" />
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => setOpen("expense")}
            className="key key-accent flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-semibold"
          >
            <ArrowUpRight className="size-[1.125rem]" />
            Egreso
          </button>
        </div>
      </div>

      {open ? (
        <EntrySheet
          kind={open}
          categories={categories}
          fixedExpenses={fixedExpenses}
          baseCurrency={baseCurrency}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Hoja de registro                                                            */
/* -------------------------------------------------------------------------- */

function EntrySheet({
  kind,
  categories,
  fixedExpenses,
  baseCurrency,
  onClose,
}: {
  kind: Kind;
  categories: PocketCategory[];
  fixedExpenses: FixedExpense[];
  baseCurrency: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createTransaction,
    INITIAL
  );
  const [tab, setTab] = useState<"manual" | "fixed">("manual");
  const [categoryId, setCategoryId] = useState("");
  const [fixedId, setFixedId] = useState("");

  const isIncome = kind === "income";
  const active = fixedExpenses.filter((expense) => expense.active);
  const selected = active.find((expense) => expense.id === fixedId) ?? null;
  const usingFixed = !isIncome && tab === "fixed";

  const options = categories.filter(
    (category) => category.kind === kind || category.kind === "both"
  );

  useEffect(() => {
    if (state.status === "saved") onClose();
  }, [state, onClose]);

  // Mientras la hoja está arriba, el fondo no se mueve.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isIncome ? "Registrar ingreso" : "Registrar egreso"}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="veil absolute inset-0"
      />

      <div className="sheet relative z-10 max-h-[92dvh] w-full max-w-[30rem] overflow-y-auto overscroll-contain px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-5 flex justify-center">
          <span aria-hidden="true" className="sheet-grip" />
        </div>

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{isIncome ? "Entra plata" : "Sale plata"}</p>
            <h2 className="display mt-2 text-[2rem]">
              {isIncome ? "Nuevo ingreso" : "Nuevo egreso"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="key flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--text-2)]"
          >
            <Cross className="size-3.5" />
          </button>
        </div>

        {!isIncome ? (
          <div className="tabs mb-5">
            <button
              type="button"
              className="tab"
              data-active={tab === "manual" ? "true" : "false"}
              onClick={() => setTab("manual")}
            >
              Egreso manual
            </button>
            <button
              type="button"
              className="tab"
              data-active={tab === "fixed" ? "true" : "false"}
              onClick={() => setTab("fixed")}
            >
              Egreso fijo
            </button>
          </div>
        ) : null}

        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="kind" value={kind} />
          {usingFixed ? (
            <input type="hidden" name="fixed_expense_id" value={fixedId} />
          ) : (
            <input type="hidden" name="category_id" value={categoryId} />
          )}

          {usingFixed ? (
            <FixedPicker
              expenses={active}
              value={fixedId}
              onChange={setFixedId}
              categories={categories}
            />
          ) : null}

          {usingFixed && selected ? (
            <input type="hidden" name="description" value={selected.name} />
          ) : null}

          {!usingFixed ? (
            <div>
              <label className="field-label" htmlFor="description">
                {isIncome ? "De dónde viene" : "En qué se fue"}
              </label>
              <input
                id="description"
                name="description"
                type="text"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                placeholder={
                  isIncome
                    ? "Pago de un proyecto, venta…"
                    : "Café, gasolina, súper…"
                }
                className="field"
              />
            </div>
          ) : null}

          {!usingFixed || selected ? (
            <>
              <div>
                <label className="field-label" htmlFor="amount">
                  {usingFixed ? "Monto · editable" : "Monto"}
                </label>
                <div className="flex gap-2">
                  <input
                    key={`amount-${fixedId}`}
                    id="amount"
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    defaultValue={selected ? selected.amount : ""}
                    placeholder="0.00"
                    className="field min-w-0 flex-1 text-[1.375rem] tabular-nums"
                  />
                  <select
                    key={`currency-${fixedId}`}
                    name="currency"
                    aria-label="Moneda"
                    defaultValue={selected ? selected.currency : baseCurrency}
                    className="field w-[6.25rem] shrink-0 text-[0.9375rem]"
                  >
                    {CURRENCIES.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-[0.75rem] text-[var(--text-3)]">
                  Se guarda convertido a {baseCurrency} al cambio del día.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="occurred_at">
                  Fecha
                </label>
                <input
                  id="occurred_at"
                  name="occurred_at"
                  type="date"
                  defaultValue={isoDate(new Date())}
                  className="field tabular-nums"
                />
              </div>
            </>
          ) : null}

          {!usingFixed ? (
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="field-label mb-0">Categoría</span>
                <span className="text-[0.6875rem] text-[var(--text-3)]">
                  {categoryId ? "Elegida por vos" : "La define la IA"}
                </span>
              </div>
              <CategoryGrid
                categories={options}
                value={categoryId}
                onChange={setCategoryId}
                allowAuto
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending || (usingFixed && !selected)}
            className="key key-accent h-14 w-full text-[1rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? categoryId || usingFixed
                ? "Guardando…"
                : "Clasificando…"
              : usingFixed
                ? "Registrar gasto fijo"
                : isIncome
                  ? "Registrar ingreso"
                  : "Registrar egreso"}
          </button>

          {state.status === "error" ? (
            <p
              role="alert"
              className="text-center text-[0.8125rem] text-[var(--danger)]"
            >
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FixedPicker({
  expenses,
  value,
  onChange,
  categories,
}: {
  expenses: FixedExpense[];
  value: string;
  onChange: (id: string) => void;
  categories: PocketCategory[];
}) {
  if (expenses.length === 0) {
    return (
      <div className="groove flex flex-col items-center gap-2 px-5 py-8 text-center">
        <Repeat className="size-5 text-[var(--text-3)]" />
        <p className="text-[0.875rem] text-[var(--text-2)]">
          Todavía no tenés gastos fijos.
        </p>
        <p className="text-[0.75rem] text-[var(--text-3)]">
          Se configuran en Ajustes y después se registran de un toque.
        </p>
      </div>
    );
  }

  return (
    <div>
      <span className="field-label">¿Cuál de tus gastos fijos?</span>
      <ul className="flex flex-col gap-2">
        {expenses.map((expense) => {
          const active = value === expense.id;
          const category = categories.find(
            (item) => item.id === expense.category_id
          );

          return (
            <li key={expense.id}>
              <button
                type="button"
                onClick={() => onChange(expense.id)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-[18px] p-3 text-left transition-[transform,box-shadow] duration-500 [transition-timing-function:var(--ease-expo)] active:scale-[0.99] ${
                  active ? "key key-accent" : "groove"
                }`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    active ? "bg-black/15" : "bg-white/5 text-[var(--accent)]"
                  }`}
                >
                  <CategoryIcon
                    iconKey={category?.icon_key ?? "bills"}
                    className="size-[1.125rem]"
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">
                    {expense.name}
                  </span>
                  <span
                    className={`block truncate text-[0.75rem] ${
                      active ? "opacity-70" : "text-[var(--text-3)]"
                    }`}
                  >
                    {expense.day_of_month
                      ? `Cada ${expense.day_of_month}`
                      : "Sin día fijo"}
                    {category ? ` · ${category.name}` : ""}
                  </span>
                </span>

                <span className="display shrink-0 text-[1.0625rem] tabular-nums">
                  {formatMoney(expense.amount, expense.currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
