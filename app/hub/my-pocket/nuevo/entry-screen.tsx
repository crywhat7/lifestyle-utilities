"use client";

import Link from "next/link";
import { useActionState, useState, type CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import {
  ArrowBack,
  Chevron,
  Mic,
  Repeat,
  Scan,
  Spark,
} from "@/components/icons";
import { CURRENCIES, formatMoney } from "@/lib/money";
import {
  isoDate,
  recurrenceLabel,
  type FixedExpense,
  type PaySchedule,
  type PocketCategory,
} from "@/lib/pocket";
import { createTransaction, type FormState } from "../actions";

type Kind = "income" | "expense";

/** "" = la IA decide. null = todavía no se decidió nada. */
type Choice = string | null;

const INITIAL: FormState = { status: "idle" };

const COPY = {
  expense: {
    eyebrow: "Sale plata",
    title: "Nuevo egreso",
    ask: "¿En qué se fue?",
    tabManual: "Egreso manual",
    tabTemplate: "Contemplado",
    describeLabel: "En qué se fue",
    describeHint: "Café, gasolina, súper…",
    submit: "Registrar egreso",
  },
  income: {
    eyebrow: "Entra plata",
    title: "Nuevo ingreso",
    ask: "¿De dónde viene?",
    tabManual: "Ingreso manual",
    tabTemplate: "Salario",
    describeLabel: "De dónde viene",
    describeHint: "Pago de un proyecto, venta…",
    submit: "Registrar ingreso",
  },
} as const;

/* -------------------------------------------------------------------------- */

/**
 * Pantalla completa, nunca una hoja: un solo scroll, el de la página.
 *
 * Dos actos. Primero se elige la categoría — es lo que la persona sabe antes
 * que nada y lo que le ahorra el viaje a la IA. Después se escribe el monto,
 * que ocupa la pantalla como el saldo ocupa el balance.
 */
export function EntryScreen({
  kind,
  categories,
  fixedExpenses,
  paySchedules,
  baseCurrency,
  preselect = null,
}: {
  kind: Kind;
  categories: PocketCategory[];
  fixedExpenses: FixedExpense[];
  paySchedules: PaySchedule[];
  baseCurrency: string;
  /** Plantilla que llega elegida desde el balance: se salta el primer acto. */
  preselect?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    createTransaction,
    INITIAL
  );

  // Un fijo que llega por URL entra directo al monto: la persona ya eligió
  // qué va a pagar cuando tocó la fila, volver a preguntárselo es un paso de más.
  const arriving =
    preselect && fixedExpenses.some((expense) => expense.id === preselect)
      ? preselect
      : null;

  const [mode, setMode] = useState<"manual" | "template">(
    arriving ? "template" : "manual"
  );
  const [templateId, setTemplateId] = useState(arriving ?? "");
  const [categoryId, setCategoryId] = useState<Choice>(() => {
    if (!arriving) return null;
    const expense = fixedExpenses.find((item) => item.id === arriving);
    return expense?.category_id ?? "";
  });
  const [composing, setComposing] = useState(Boolean(arriving));
  // "Cambiar" desde una plantilla pide la cuadrícula, no la lista de plantillas.
  const [picking, setPicking] = useState(false);

  const copy = COPY[kind];
  const isIncome = kind === "income";

  const options = categories.filter(
    (category) => category.kind === kind || category.kind === "both"
  );

  const templates: Template[] = isIncome
    ? paySchedules
        .filter((schedule) => schedule.active)
        .map((schedule) => ({
          id: schedule.id,
          name: schedule.label,
          amount: schedule.amount,
          amountMax: null,
          currency: schedule.currency,
          note: recurrenceLabel(schedule),
          categoryId: null,
        }))
    : fixedExpenses
        .filter((expense) => expense.active)
        .map((expense) => ({
          id: expense.id,
          name: expense.name,
          amount: expense.amount,
          amountMax: expense.amount_max,
          currency: expense.currency,
          note: recurrenceLabel(expense),
          categoryId: expense.category_id,
        }));

  const template = templates.find((item) => item.id === templateId) ?? null;
  const usingTemplate = mode === "template";

  // El salario cae solo en su categoría: nadie debería elegirla cada quincena.
  const salaryCategory =
    options.find((category) => category.slug === "salario") ?? null;

  const chosen =
    categoryId === null || categoryId === ""
      ? null
      : (options.find((category) => category.id === categoryId) ?? null);

  const auto = categoryId === "";

  function switchMode(next: "manual" | "template") {
    setMode(next);
    setTemplateId("");
    setCategoryId(null);
    setComposing(false);
    setPicking(false);
  }

  function pickCategory(id: Choice) {
    setCategoryId(id);
    setPicking(false);
    setComposing(true);
  }

  function pickTemplate(item: Template) {
    setTemplateId(item.id);
    if (categoryId === null) {
      setCategoryId(
        item.categoryId ?? (isIncome ? (salaryCategory?.id ?? "") : "")
      );
    }
    setComposing(true);
  }

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <Link
          href="/hub/my-pocket"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Pocket
        </Link>
        <span className="eyebrow">{copy.eyebrow}</span>
      </header>

      <section className="mt-2">
        <h1
          className="display rise emboss text-[clamp(2.25rem,11vw,3rem)]"
          style={
            {
              "--d": "100ms",
              color: isIncome ? "var(--accent)" : "var(--text-1)",
            } as CSSProperties
          }
        >
          {copy.title}
        </h1>
      </section>

      {/* La pestaña de plantillas existe siempre, incluso vacía: es el lugar
          donde se registra el sueldo, aunque solo se use dos veces al mes. */}
      <div className="tabs rise" style={{ "--d": "150ms" } as CSSProperties}>
        <button
          type="button"
          className="tab"
          data-active={mode === "manual" ? "true" : "false"}
          onClick={() => switchMode("manual")}
        >
          {copy.tabManual}
        </button>
        <button
          type="button"
          className="tab"
          data-active={usingTemplate ? "true" : "false"}
          onClick={() => switchMode("template")}
        >
          {copy.tabTemplate}
        </button>
      </div>

      {!composing && !isIncome ? (
        /* Los dos atajos que no pasan por el teclado. Van juntos y arriba de
           todo: si registrar un gasto se puede hacer sin escribir, esa es la
           puerta principal, no una función escondida. */
        <div
          className="rise grid grid-cols-2 gap-2"
          style={{ "--d": "180ms" } as CSSProperties}
        >
          <Link
            href="/hub/my-pocket/nuevo/dictar"
            className="groove flex flex-col gap-2 p-3.5"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-white/5 text-[var(--accent)]">
              <Mic className="size-[1.125rem]" />
            </span>
            <span className="text-[0.9375rem] font-medium">Dictarlo</span>
            <span className="text-[0.75rem] leading-snug text-[var(--text-3)]">
              7 segundos de voz y listo.
            </span>
          </Link>

          <Link
            href="/hub/my-pocket/nuevo/escanear"
            className="groove flex flex-col gap-2 p-3.5"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-white/5 text-[var(--accent)]">
              <Scan className="size-[1.125rem]" />
            </span>
            <span className="text-[0.9375rem] font-medium">Leer captura</span>
            <span className="text-[0.75rem] leading-snug text-[var(--text-3)]">
              Varios egresos del banco de una.
            </span>
          </Link>
        </div>
      ) : null}

      {!composing ? (
        usingTemplate && !picking ? (
          <TemplateStep
            templates={templates}
            isIncome={isIncome}
            onPick={pickTemplate}
          />
        ) : (
          <CategoryStep
            ask={copy.ask}
            categories={options}
            onPick={pickCategory}
          />
        )
      ) : (
        <form action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="kind" value={kind} />
          {categoryId ? (
            <input type="hidden" name="category_id" value={categoryId} />
          ) : null}
          {usingTemplate && template ? (
            <input
              type="hidden"
              name={isIncome ? "pay_schedule_id" : "fixed_expense_id"}
              value={template.id}
            />
          ) : null}

          <ChosenChip
            label={chosen?.name ?? (auto ? "La define la IA" : "Sin categoría")}
            iconKey={chosen?.icon_key ?? null}
            auto={auto}
            onChange={() => {
              setPicking(true);
              setComposing(false);
            }}
          />

          {/* Momento firma: el monto se escribe del tamaño del saldo. */}
          <div
            className="rise"
            style={{ "--d": "60ms" } as CSSProperties}
          >
            <label className="field-label" htmlFor="amount">
              Monto
            </label>
            <div className="groove flex items-end gap-3 px-4 py-4">
              <input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                autoFocus
                defaultValue={template ? template.amount : ""}
                placeholder="0"
                className="display min-w-0 flex-1 bg-transparent text-[clamp(2.25rem,12vw,3.25rem)] tabular-nums outline-none placeholder:text-[var(--text-3)]"
              />
              <select
                name="currency"
                aria-label="Moneda"
                defaultValue={template ? template.currency : baseCurrency}
                className="field w-[5.5rem] shrink-0 px-3 py-2.5 text-[0.8125rem]"
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 px-1 text-[0.75rem] text-[var(--text-3)]">
              {template?.amountMax
                ? `Lo contemplado va de ${formatMoney(template.amount, template.currency)} a ${formatMoney(template.amountMax, template.currency)}. `
                : ""}
              Se guarda convertido a {baseCurrency} al cambio del día.
            </p>
          </div>

          <div className="rise" style={{ "--d": "110ms" } as CSSProperties}>
            <label className="field-label" htmlFor="description">
              {copy.describeLabel}
            </label>
            <input
              id="description"
              name="description"
              type="text"
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              defaultValue={template ? template.name : ""}
              placeholder={copy.describeHint}
              className="field"
            />
          </div>

          <div className="rise" style={{ "--d": "160ms" } as CSSProperties}>
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

          <div
            className="rise flex flex-col gap-3"
            style={{ "--d": "210ms" } as CSSProperties}
          >
            <button
              type="submit"
              disabled={pending}
              className="key key-accent h-14 w-full rounded-full text-[1rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending
                ? auto
                  ? "Clasificando…"
                  : "Guardando…"
                : usingTemplate
                  ? isIncome
                    ? "Registrar salario"
                    : "Registrar contemplado"
                  : copy.submit}
            </button>

            {state.status === "error" ? (
              <p
                role="alert"
                className="text-center text-[0.8125rem] text-[var(--danger)]"
              >
                {state.error}
              </p>
            ) : null}
          </div>
        </form>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

type Template = {
  id: string;
  name: string;
  /** Piso del rango contemplado, y lo que se propone al registrar. */
  amount: number;
  amountMax: number | null;
  currency: string;
  note: string;
  categoryId: string | null;
};

/**
 * Primer acto. La cuadrícula ocupa la pantalla entera para que elegir sea
 * más rápido que escribir; dejarle el trabajo a la IA queda abajo, a un toque
 * de distancia, pero deliberado.
 */
function CategoryStep({
  ask,
  categories,
  onPick,
}: {
  ask: string;
  categories: PocketCategory[];
  onPick: (id: Choice) => void;
}) {
  return (
    <>
      <p
        className="display rise text-[1.5rem] text-[var(--text-2)]"
        style={{ "--d": "190ms" } as CSSProperties}
      >
        {ask}
      </p>

      <div
        className="rise grid grid-cols-4 gap-2"
        style={{ "--d": "240ms" } as CSSProperties}
      >
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onPick(category.id)}
            className="tile relative"
          >
            {category.user_id ? (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            ) : null}
            <CategoryIcon
              iconKey={category.icon_key}
              className="size-[1.375rem]"
            />
            <span className="tile-label">{category.name}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onPick("")}
        className="rise groove flex items-center gap-3 px-4 py-4 text-left"
        style={{ "--d": "300ms" } as CSSProperties}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-[var(--accent)]">
          <Spark className="size-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">
            No sé, que la elija la IA
          </span>
          <span className="block text-[0.75rem] text-[var(--text-3)]">
            La deduce de lo que escribas. Tarda un segundo más.
          </span>
        </span>
        <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--text-3)]" />
      </button>
    </>
  );
}

function TemplateStep({
  templates,
  isIncome,
  onPick,
}: {
  templates: Template[];
  isIncome: boolean;
  onPick: (item: Template) => void;
}) {
  if (templates.length === 0) {
    return (
      <div
        className="groove rise flex flex-col items-center gap-2 px-6 py-10 text-center"
        style={{ "--d": "190ms" } as CSSProperties}
      >
        <Repeat className="size-5 text-[var(--text-3)]" />
        <p className="text-[0.875rem] text-[var(--text-2)]">
          {isIncome
            ? "Todavía no tenés fechas de pago."
            : "Todavía no tenés gastos contemplados."}
        </p>
        <Link
          href="/hub/my-pocket/ajustes"
          className="key mt-2 flex h-11 items-center rounded-full px-5 text-[0.8125rem]"
        >
          Configurar en Ajustes
        </Link>
      </div>
    );
  }

  return (
    <>
      <p
        className="display rise text-[1.5rem] text-[var(--text-2)]"
        style={{ "--d": "190ms" } as CSSProperties}
      >
        {isIncome ? "¿Cuál de tus pagos?" : "¿Cuál de tus contemplados?"}
      </p>

      <ul
        className="rise flex flex-col gap-2"
        style={{ "--d": "240ms" } as CSSProperties}
      >
        {templates.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="groove flex w-full items-center gap-3 p-3 text-left transition-transform duration-200 [transition-timing-function:var(--ease-expo)] active:scale-[0.99]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-[var(--accent)]">
                <Repeat className="size-[1.125rem]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">
                  {item.name}
                </span>
                <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
                  {item.note}
                </span>
              </span>
              <span className="display shrink-0 text-right text-[1.0625rem] tabular-nums">
                {formatMoney(item.amount, item.currency)}
                {item.amountMax ? (
                  <span className="block text-[0.6875rem] text-[var(--text-3)]">
                    a {formatMoney(item.amountMax, item.currency)}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** La categoría elegida no se esconde: queda arriba del monto, y se cambia. */
function ChosenChip({
  label,
  iconKey,
  auto,
  onChange,
}: {
  label: string;
  iconKey: string | null;
  auto: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="rise groove flex items-center gap-3 px-4 py-3 text-left"
      style={{ "--d": "20ms" } as CSSProperties}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5"
        style={{ color: "var(--accent)" }}
      >
        {auto || !iconKey ? (
          <Spark className="size-[1.125rem]" />
        ) : (
          <CategoryIcon iconKey={iconKey} className="size-[1.125rem]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] tracking-[0.18em] text-[var(--text-3)] uppercase">
          Categoría
        </span>
        <span className="block truncate text-[0.9375rem] font-medium">
          {label}
        </span>
      </span>
      <span className="text-[0.75rem] text-[var(--accent)]">Cambiar</span>
    </button>
  );
}
