"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { CategoryIcon, ICON_KEYS } from "@/components/category-icons";
import { Calendar, Cross, PlusSlot, Repeat, Trash } from "@/components/icons";
import { CURRENCIES, formatMoney } from "@/lib/money";
import {
  fromIsoDate,
  isoDate,
  hasRange,
  recurrenceBadge,
  recurrenceLabel,
  type FixedExpense,
  type PaySchedule,
  type PocketCategory,
} from "@/lib/pocket";
import {
  createCategory,
  deleteCategory,
  deleteFixedExpense,
  deletePaySchedule,
  saveFixedExpense,
  savePaySchedule,
  savePocketSince,
  type FormState,
} from "../actions";
import { CategoryGrid } from "../category-grid";
import { RecurrenceFields } from "./recurrence-fields";

const INITIAL: FormState = { status: "idle" };

/** Cabecera compartida de cada bloque de ajustes. */
function SectionHead({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="mb-4">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display mt-2 text-[1.625rem]">{title}</h2>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
        {note}
      </p>
    </div>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.status === "error") {
    return (
      <p role="alert" className="text-center text-[0.8125rem] text-[var(--danger)]">
        {state.error}
      </p>
    );
  }
  return null;
}

function AddButton({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="key mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
    >
      {open ? <Cross className="size-3.5" /> : <PlusSlot className="size-4" />}
      {open ? "Cancelar" : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Fechas de pago                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Desde cuándo cuentan los gastos contemplados.
 *
 * Sin esta frontera, el primer día la app señala como atrasado todo recibo
 * cuyo día ya pasó este mes — aunque la persona los haya pagado antes de tener
 * cuenta. Por defecto es el día en que se creó el perfil; se corrige acá
 * cuando ese día no es el que la persona considera su punto de partida.
 */
export function TrackingSince({
  since,
  accountSince,
  custom,
}: {
  since: string;
  accountSince: string;
  custom: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePocketSince, INITIAL);

  return (
    <section className="plate p-5">
      <SectionHead
        eyebrow="La frontera"
        title="Desde cuándo cuenta"
        note="Los gastos contemplados que vencían antes de esta fecha no salen como atrasados: se pagaron antes de que existiera la cuenta. Vaciala para volver al día en que empezaste."
      />

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="pocket-since">
            Primer día del seguimiento
          </label>
          <input
            id="pocket-since"
            name="pocket_since"
            type="date"
            max={isoDate(new Date())}
            defaultValue={since}
            className="field tabular-nums"
          />
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
            {custom
              ? `Puesta a mano. Tu cuenta arrancó el ${longDay(accountSince)}.`
              : `Heredada de tu cuenta, que arrancó el ${longDay(accountSince)}.`}
          </p>
        </div>

        <Feedback state={state} />

        <button
          type="submit"
          disabled={pending}
          className="key key-accent flex h-13 items-center justify-center rounded-full text-[0.9375rem] font-semibold disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar fecha"}
        </button>
      </form>
    </section>
  );
}

/** "27 de agosto de 2026" — la fecha en palabras, no en casillas. */
function longDay(iso: string) {
  const date = fromIsoDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString("es-GT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */

export function PaySchedules({
  schedules,
  baseCurrency,
  suggested,
}: {
  schedules: PaySchedule[];
  baseCurrency: string;
  suggested: number;
}) {
  const [state, formAction, pending] = useActionState(savePaySchedule, INITIAL);
  const [open, setOpen] = useState(schedules.length === 0);
  const [editing, setEditing] = useState<PaySchedule | null>(null);

  // Al guardar, el formulario se recoge solo. Se ajusta durante el render
  // porque es una reacción a un cambio de estado, no un efecto secundario.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "saved") {
      setEditing(null);
      setOpen(false);
    }
  }

  const showing = open || editing !== null;

  return (
    <section className="plate p-5">
      <SectionHead
        eyebrow="Cuándo te pagan"
        title="Fechas de pago"
        note="Podés no tener ninguna, o tener varias con montos distintos: el 15 y el 30, o todos los miércoles si te pagan por semana. Cuando cae la fecha, el ingreso se registra solo y te avisa."
      />

      {schedules.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {schedules.map((schedule) => (
            /*
               Dos líneas a propósito. En un teléfono de 375px, la insignia,
               el monto y los dos iconos no dejan sitio para el nombre: con
               todo en una fila "Quincena" se lee "Qu…". Las acciones bajan a
               su propio renglón y el nombre recupera el ancho que necesita.
            */
            <li key={schedule.id} className="groove flex flex-col gap-1 p-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] px-1">
                  <span className="display text-center text-[0.8125rem] leading-tight tabular-nums text-[var(--accent-ink)]">
                    {recurrenceBadge(schedule)}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">
                    {schedule.label}
                  </span>
                  <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
                    {recurrenceLabel(schedule)}
                  </span>
                </span>

                <span className="display shrink-0 text-[1.0625rem] tabular-nums">
                  {formatMoney(schedule.amount, schedule.currency)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(schedule);
                    setOpen(false);
                  }}
                  aria-label={`Editar ${schedule.label}`}
                  className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.75rem] text-[var(--text-3)]"
                >
                  <Calendar className="size-3.5" />
                  Editar
                </button>

                <form action={deletePaySchedule}>
                  <input type="hidden" name="id" value={schedule.id} />
                  <button
                    type="submit"
                    aria-label={`Borrar ${schedule.label}`}
                    className="flex size-9 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--danger)]"
                  >
                    <Trash className="size-4" />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showing ? (
        <form
          key={editing?.id ?? "new"}
          action={formAction}
          className="flex flex-col gap-4 border-t border-[var(--edge)] pt-5"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <div>
            <label className="field-label" htmlFor="pay-label">
              Nombre del pago
            </label>
            <input
              id="pay-label"
              name="label"
              type="text"
              maxLength={40}
              defaultValue={editing?.label ?? "Quincena"}
              className="field"
            />
          </div>

          <RecurrenceFields id="pay" value={editing} />

          <div>
            <label className="field-label" htmlFor="pay-amount">
              Cuánto te pagan
            </label>
            <input
              id="pay-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              defaultValue={editing?.amount ?? (suggested > 0 ? suggested : "")}
              className="field tabular-nums"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="pay-currency">
              Moneda
            </label>
            <select
              id="pay-currency"
              name="currency"
              defaultValue={editing?.currency ?? baseCurrency}
              className="field"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="key key-accent w-full py-4 text-[0.9375rem] font-semibold disabled:opacity-70"
          >
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar fecha"}
          </button>

          <Feedback state={state} />
        </form>
      ) : null}

      {editing ? (
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="key mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
        >
          <Cross className="size-3.5" />
          Cancelar edición
        </button>
      ) : (
        <AddButton
          open={open}
          onToggle={() => setOpen((value) => !value)}
          label="Agregar fecha de pago"
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Gastos contemplados                                                          */
/* -------------------------------------------------------------------------- */

export function FixedExpenses({
  expenses,
  categories,
  baseCurrency,
}: {
  expenses: FixedExpense[];
  categories: PocketCategory[];
  baseCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(saveFixedExpense, INITIAL);
  const [open, setOpen] = useState(expenses.length === 0);
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [categoryId, setCategoryId] = useState("");

  // Al guardar, el formulario se recoge solo. Se ajusta durante el render
  // porque es una reacción a un cambio de estado, no un efecto secundario.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "saved") {
      setEditing(null);
      setOpen(false);
      setCategoryId("");
    }
  }

  const showing = open || editing !== null;
  const options = categories.filter(
    (category) => category.kind === "expense" || category.kind === "both"
  );
  const byId = new Map(categories.map((category) => [category.id, category]));

  return (
    <section className="plate p-5">
      <SectionHead
        eyebrow="Lo que se repite"
        title="Gastos contemplados"
        note="Renta, internet, la compra de todos los sábados. No hace falta que caigan siempre por el mismo monto: poné un rango y la agenda cuenta con el techo."
      />

      {expenses.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {expenses.map((expense) => {
            const category = byId.get(expense.category_id ?? "");

            return (
              /* Mismo reparto en dos líneas que las fechas de pago: el
                 nombre y el rango necesitan el ancho, las acciones no. */
              <li key={expense.id} className="groove flex flex-col gap-1 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
                    <CategoryIcon
                      iconKey={category?.icon_key ?? "bills"}
                      className="size-[1.125rem]"
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">
                      {expense.name}
                    </span>
                    <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
                      {recurrenceLabel(expense)}
                      {category ? ` · ${category.name}` : ""}
                    </span>
                  </span>

                  <span className="display shrink-0 text-right text-[1.0625rem] tabular-nums">
                    {formatMoney(expense.amount, expense.currency)}
                    {hasRange(expense) ? (
                      <span className="block text-[0.6875rem] text-[var(--text-3)]">
                        a {formatMoney(expense.amount_max ?? 0, expense.currency)}
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(expense);
                      setCategoryId(expense.category_id ?? "");
                      setOpen(false);
                    }}
                    aria-label={`Editar ${expense.name}`}
                    className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.75rem] text-[var(--text-3)]"
                  >
                    <Repeat className="size-3.5" />
                    Editar
                  </button>

                  <form action={deleteFixedExpense}>
                    <input type="hidden" name="id" value={expense.id} />
                    <button
                      type="submit"
                      aria-label={`Borrar ${expense.name}`}
                      className="flex size-9 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--danger)]"
                    >
                      <Trash className="size-4" />
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showing ? (
        <form
          key={editing?.id ?? "new"}
          action={formAction}
          className="flex flex-col gap-4 border-t border-[var(--edge)] pt-5"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <input type="hidden" name="category_id" value={categoryId} />

          <div>
            <label className="field-label" htmlFor="fixed-name">
              Nombre
            </label>
            <input
              id="fixed-name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={60}
              defaultValue={editing?.name ?? ""}
              placeholder="Renta, Netflix, internet…"
              className="field"
            />
          </div>

          {/* Piso y techo. Dejar el techo vacío es decir "siempre cae igual",
              que es el caso de la renta y de casi ninguna otra cosa. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label" htmlFor="fixed-amount">
                Desde
              </label>
              <input
                id="fixed-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                defaultValue={editing?.amount ?? ""}
                className="field tabular-nums"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="fixed-amount-max">
                Hasta · opcional
              </label>
              <input
                id="fixed-amount-max"
                name="amount_max"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                defaultValue={editing?.amount_max ?? ""}
                placeholder="Mismo monto"
                className="field tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="fixed-currency">
              Moneda
            </label>
            <select
              id="fixed-currency"
              name="currency"
              defaultValue={editing?.currency ?? baseCurrency}
              className="field text-[0.9375rem]"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.label}
                </option>
              ))}
            </select>
          </div>

          <RecurrenceFields id="fixed" value={editing} optionalDay />

          <div>
            <span className="field-label">Categoría · opcional</span>
            <CategoryGrid
              categories={options}
              value={categoryId}
              onChange={setCategoryId}
              allowAuto
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="key key-accent w-full py-4 text-[0.9375rem] font-semibold disabled:opacity-70"
          >
            {pending
              ? "Guardando…"
              : editing
                ? "Guardar cambios"
                : "Agregar gasto contemplado"}
          </button>

          <Feedback state={state} />
        </form>
      ) : null}

      {editing ? (
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="key mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
        >
          <Cross className="size-3.5" />
          Cancelar edición
        </button>
      ) : (
        <AddButton
          open={open}
          onToggle={() => setOpen((value) => !value)}
          label="Agregar gasto contemplado"
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Categorías personales                                                       */
/* -------------------------------------------------------------------------- */

export function CustomCategories({ mine }: { mine: PocketCategory[] }) {
  const [state, formAction, pending] = useActionState(createCategory, INITIAL);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [iconKey, setIconKey] = useState<string>("other");

  // Al guardar, el formulario se recoge solo. Se ajusta durante el render
  // porque es una reacción a un cambio de estado, no un efecto secundario.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "saved") setOpen(false);
  }

  return (
    <section className="plate p-5">
      <SectionHead
        eyebrow="Solo tuyas"
        title="Categorías propias"
        note="Las que creás acá solo las ves vos, y la IA nunca las usa: si querés una de estas, seleccionala a mano al registrar."
      />

      {mine.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {mine.map((category) => (
            <li key={category.id} className="groove flex items-center gap-3 p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
                <CategoryIcon
                  iconKey={category.icon_key}
                  className="size-[1.125rem]"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">
                  {category.name}
                </span>
                <span className="block text-[0.75rem] text-[var(--text-3)]">
                  {category.kind === "income" ? "Ingresos" : "Egresos"}
                </span>
              </span>

              <form action={deleteCategory}>
                <input type="hidden" name="id" value={category.id} />
                <button
                  type="submit"
                  aria-label={`Borrar ${category.name}`}
                  className="flex size-8 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--danger)]"
                >
                  <Trash className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form
          action={formAction}
          className="flex flex-col gap-4 border-t border-[var(--edge)] pt-5"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="icon_key" value={iconKey} />

          <div className="tabs">
            <button
              type="button"
              className="tab"
              data-active={kind === "expense" ? "true" : "false"}
              onClick={() => setKind("expense")}
            >
              Egresos
            </button>
            <button
              type="button"
              className="tab"
              data-active={kind === "income" ? "true" : "false"}
              onClick={() => setKind("income")}
            >
              Ingresos
            </button>
          </div>

          <div>
            <label className="field-label" htmlFor="category-name">
              Nombre
            </label>
            <input
              id="category-name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={40}
              placeholder="Mis plantas, moto…"
              className="field"
            />
          </div>

          <div>
            <span className="field-label">Icono</span>
            <div className="grid grid-cols-6 gap-2">
              {ICON_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIconKey(key)}
                  data-active={iconKey === key ? "true" : "false"}
                  aria-label={key}
                  aria-pressed={iconKey === key}
                  className="tile"
                >
                  <CategoryIcon iconKey={key} className="size-[1.25rem]" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="key key-accent w-full py-4 text-[0.9375rem] font-semibold disabled:opacity-70"
          >
            {pending ? "Creando…" : "Crear categoría"}
          </button>

          <Feedback state={state} />
        </form>
      ) : null}

      <AddButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
        label="Crear categoría propia"
      />
    </section>
  );
}

/** Reservado para la coreografía de entrada de la página de ajustes. */
export function Stagger({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rise" style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
