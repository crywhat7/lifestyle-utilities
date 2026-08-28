import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import {
  ArrowBack,
  ArrowIn,
  ArrowUpRight,
  Calendar,
  Check,
  Chevron,
  Grid,
  Repeat,
  Sliders,
  Spark,
} from "@/components/icons";
import { formatMoney } from "@/lib/money";
import {
  dayLabel,
  daysAwayLabel,
  dueLabel,
  fixedDues,
  fromIsoDate,
  monthStart,
  nextPayday,
  sumByCurrency,
  totals,
  type FixedDue,
  type PocketCategory,
  type PocketTransaction,
} from "@/lib/pocket";
import { WorkProfileForm } from "../should-i-buy-it/work-profile-form";
import {
  loadCategories,
  loadFixedExpenses,
  loadLedger,
  loadPaidFixedThisMonth,
  loadPaySchedules,
  loadTransactions,
  pocketSession,
} from "./data";
import { PushNudge } from "./push-nudge";

export const metadata: Metadata = {
  title: "My Pocket",
  description: "Tu balance real: lo que entra, lo que sale y en qué se va.",
};

export default async function MyPocketPage() {
  const { supabase, user, profile, since: trackingSince } =
    await pocketSession();

  if (!profile) return <Onboarding />;

  const [categories, schedules, fixed] = await Promise.all([
    loadCategories(supabase),
    loadPaySchedules(supabase, user.id),
    loadFixedExpenses(supabase, user.id),
  ]);

  const [ledger, transactions, paidFixed] = await Promise.all([
    loadLedger(supabase, user.id),
    loadTransactions(supabase, user.id, 40),
    loadPaidFixedThisMonth(supabase, user.id),
  ]);

  const all = totals(ledger);
  const since = monthStart();
  const month = totals(ledger.filter((row) => row.occurred_at >= since));
  const payday = nextPayday(schedules);
  const dues = fixedDues(fixed, paidFixed, new Date(), fromIsoDate(trackingSince));
  const negative = all.balance < 0;

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-32">
        <header
          className="fade flex items-center justify-between"
          style={{ "--d": "40ms" } as CSSProperties}
        >
          <Link
            href="/hub"
            className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
          >
            <ArrowBack className="size-4" />
            Hub
          </Link>
          <Link
            href="/hub/my-pocket/ajustes"
            aria-label="Ajustes de My Pocket"
            className="key flex size-10 items-center justify-center rounded-full text-[var(--text-2)]"
          >
            <Sliders className="size-4" />
          </Link>
        </header>

        {/* Momento firma: el saldo ocupa la pantalla, en verde o en rojo */}
        <section className="mt-3">
          <p
            className="eyebrow rise"
            style={{ "--d": "100ms" } as CSSProperties}
          >
            Balance general
          </p>
          <h1
            className="display rise emboss mt-3 text-[clamp(2.75rem,15vw,4.25rem)] tabular-nums"
            style={
              {
                "--d": "140ms",
                color: negative ? "var(--danger)" : "var(--text-1)",
              } as CSSProperties
            }
          >
            {formatMoney(all.balance, profile.currency)}
          </h1>
          <p
            className="rise mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-[var(--text-3)]"
            style={{ "--d": "200ms" } as CSSProperties}
          >
            <span style={{ color: "var(--accent)" }}>
              +{formatMoney(month.income, profile.currency)}
            </span>
            <span>y</span>
            <span style={{ color: "var(--danger)" }}>
              −{formatMoney(month.expense, profile.currency)}
            </span>
            <span>este mes</span>
          </p>
        </section>

        <section
          className="plate rise flex items-center gap-4 p-4"
          style={{ "--d": "260ms" } as CSSProperties}
        >
          <span className="groove flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--accent)]">
            <Calendar className="size-[1.125rem]" />
          </span>
          {payday ? (
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] text-[var(--text-2)]">
                {payday.schedule.label} · {daysAwayLabel(payday.daysAway)}
              </span>
              <span className="block text-[0.75rem] text-[var(--text-3)]">
                {payday.date.toLocaleDateString("es-GT", {
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] text-[var(--text-2)]">
                Sin fechas de pago
              </span>
              <span className="block text-[0.75rem] text-[var(--text-3)]">
                Configuralas para saber cuándo entra la próxima.
              </span>
            </span>
          )}
          {payday ? (
            <span className="display shrink-0 text-[1.125rem] tabular-nums text-[var(--accent)]">
              {formatMoney(payday.schedule.amount, payday.schedule.currency)}
            </span>
          ) : (
            <Link
              href="/hub/my-pocket/ajustes"
              className="key flex h-9 shrink-0 items-center rounded-full px-4 text-[0.75rem]"
            >
              Configurar
            </Link>
          )}
        </section>

        <PushNudge />

        <FixedAgenda dues={dues} categories={categories} />

        <div
          className="rise grid grid-cols-2 gap-3"
          style={{ "--d": "380ms" } as CSSProperties}
        >
          <Link
            href="/hub/my-pocket/categorias"
            className="key flex h-12 items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
          >
            <Grid className="size-4" />
            Por categoría
          </Link>
          <Link
            href="/hub/my-pocket/ajustes"
            className="key flex h-12 items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
          >
            <Sliders className="size-4" />
            Fijos y pagos
          </Link>
        </div>

        <section
          className="rise mt-2"
          style={{ "--d": "430ms" } as CSSProperties}
        >
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="eyebrow">Movimientos</h2>
            <span className="text-[0.6875rem] text-[var(--text-3)] tabular-nums">
              {ledger.length}
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="groove flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Spark className="size-6 text-[var(--accent)]" />
              <p className="text-[0.9375rem] text-[var(--text-2)]">
                Todavía no hay nada registrado.
              </p>
              <p className="max-w-[16rem] text-[0.8125rem] leading-relaxed text-[var(--text-3)]">
                Tocá Egreso ahí abajo, elegí la categoría y escribí cuánto fue.
              </p>
            </div>
          ) : (
            <Ledger transactions={transactions} categories={categories} />
          )}
        </section>
      </main>

      <ActionBar />
    </>
  );
}

/**
 * El pie de la pantalla: fijo, opaco, siempre a la vista.
 *
 * No flota sobre los movimientos ni los difumina — la página le reserva su
 * alto abajo, así que la lista termina donde empieza la barra. Registrar es
 * la única acción que nunca hay que ir a buscar.
 */
function ActionBar() {
  return (
    <div className="pocket-bar">
      <div
        className="fade flex gap-3"
        style={{ "--d": "460ms" } as CSSProperties}
      >
        <Link
          href="/hub/my-pocket/nuevo/ingreso"
          className="key flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium"
        >
          <ArrowIn className="size-[1.125rem] text-[var(--accent)]" />
          Ingreso
        </Link>
        <Link
          href="/hub/my-pocket/nuevo/egreso"
          className="key key-accent flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-semibold"
        >
          <ArrowUpRight className="size-[1.125rem]" />
          Egreso
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * La agenda de gastos fijos.
 *
 * Lo que el balance no dice por sí solo: de ese saldo, cuánto ya está
 * comprometido. Solo se listan los que siguen pendientes — un fijo ya pagado
 * no es una próxima salida, y cuatro filas grises apagadas ocupan la pantalla
 * sin decir nada. Cuando no queda ninguno, todo eso se reduce a una línea.
 *
 * Cada fila lleva directo a registrar ese gasto con la plantilla puesta: ver
 * que vence hoy y no poder hacer nada al respecto es medio recordatorio.
 */
function FixedAgenda({
  dues,
  categories,
}: {
  dues: FixedDue[];
  categories: PocketCategory[];
}) {
  if (dues.length === 0) return null;

  const byId = new Map(categories.map((category) => [category.id, category]));
  const pending = dues.filter((due) => !due.paid);

  // Nada pendiente: una sola línea y de vuelta al balance.
  if (pending.length === 0) {
    const next = dues[0];

    return (
      <section
        className="rise groove flex items-center gap-3 p-3.5"
        style={{ "--d": "340ms" } as CSSProperties}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-[var(--accent)]">
          <Check className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] text-[var(--text-2)]">
            Gastos fijos al día
          </span>
          <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
            El próximo es {next.expense.name}, el {next.expense.day_of_month}.
          </span>
        </span>
      </section>
    );
  }

  const shown = pending.slice(0, 4);
  const owed = sumByCurrency(
    pending.map((due) => ({
      amount: due.expense.amount,
      currency: due.expense.currency,
    }))
  );

  return (
    <section className="rise mt-2" style={{ "--d": "340ms" } as CSSProperties}>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="eyebrow">Próximos fijos</h2>
        <span className="text-[0.75rem] tabular-nums text-[var(--text-2)]">
          {owed
            .map((total) => formatMoney(total.amount, total.currency))
            .join(" · ")}{" "}
          <span className="text-[var(--text-3)]">pendiente</span>
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((due) => (
          <FixedRow
            key={due.expense.id}
            due={due}
            category={byId.get(due.expense.category_id ?? "") ?? null}
          />
        ))}
      </ul>

      {dues.length > shown.length ? (
        <Link
          href="/hub/my-pocket/ajustes"
          className="mt-2 flex items-center justify-center gap-1.5 px-1 py-2 text-[0.75rem] text-[var(--text-3)]"
        >
          Ver los {dues.length} gastos fijos
          <Chevron className="size-3 -rotate-90" />
        </Link>
      ) : null}
    </section>
  );
}

/** Una salida que todavía no se registró. Tocarla la registra. */
function FixedRow({
  due,
  category,
}: {
  due: FixedDue;
  category: PocketCategory | null;
}) {
  const overdue = due.daysAway < 0;
  const imminent = due.daysAway >= 0 && due.daysAway <= 2;

  return (
    <li>
      <Link
        href={`/hub/my-pocket/nuevo/egreso?fijo=${due.expense.id}`}
        className="groove flex items-center gap-3 p-3 transition-transform duration-200 [transition-timing-function:var(--ease-expo)] active:scale-[0.99]"
        style={overdue ? { borderColor: "rgba(255, 122, 92, 0.35)" } : undefined}
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/5"
          style={{ color: overdue ? "var(--danger)" : "var(--text-2)" }}
        >
          <CategoryIcon
            iconKey={category?.icon_key ?? "bills"}
            className="size-[1.1875rem]"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium">
            {due.expense.name}
          </span>
          <span
            className="mt-0.5 block truncate text-[0.75rem]"
            style={{
              color: overdue
                ? "var(--danger)"
                : imminent
                  ? "var(--warn)"
                  : "var(--text-3)",
            }}
          >
            El {due.expense.day_of_month} · {dueLabel(due.daysAway)}
          </span>
        </span>

        <span className="display shrink-0 text-[1.0625rem] tabular-nums">
          {formatMoney(due.expense.amount, due.expense.currency)}
        </span>

        <Repeat className="size-3.5 shrink-0 text-[var(--text-3)]" />
      </Link>
    </li>
  );
}

function Ledger({
  transactions,
  categories,
}: {
  transactions: PocketTransaction[];
  categories: PocketCategory[];
}) {
  const byId = new Map(categories.map((category) => [category.id, category]));

  // Agrupado por día: el ojo lee "ayer gasté esto", no una lista plana.
  const groups: { day: string; rows: PocketTransaction[] }[] = [];

  for (const transaction of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.day === transaction.occurred_at) last.rows.push(transaction);
    else groups.push({ day: transaction.occurred_at, rows: [transaction] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.day}>
          <p className="mb-2 px-1 text-[0.6875rem] tracking-[0.14em] text-[var(--text-3)] uppercase">
            {dayLabel(group.day)}
          </p>
          <ul className="flex flex-col gap-2">
            {group.rows.map((transaction) => (
              <Row
                key={transaction.id}
                transaction={transaction}
                category={byId.get(transaction.category_id ?? "") ?? null}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Row({
  transaction,
  category,
}: {
  transaction: PocketTransaction;
  category: PocketCategory | null;
}) {
  const income = transaction.kind === "income";
  const converted = transaction.currency !== transaction.base_currency;

  return (
    <li>
      {/* La fila entera es la puerta al detalle: ahí se recategoriza y se borra. */}
      <Link
        href={`/hub/my-pocket/movimiento/${transaction.id}`}
        className="groove flex items-center gap-3 p-3 transition-transform duration-200 [transition-timing-function:var(--ease-expo)] active:scale-[0.99]"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/5"
          style={{ color: income ? "var(--accent)" : "var(--text-2)" }}
        >
          <CategoryIcon
            iconKey={category?.icon_key ?? "other"}
            className="size-[1.1875rem]"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium">
            {transaction.description}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[0.75rem] text-[var(--text-3)]">
            {category?.name ?? "Sin categoría"}
            {transaction.ai_categorized ? (
              <span
                className="flex shrink-0 items-center"
                title="Categoría puesta por la IA"
              >
                <Spark className="size-2.5 text-[var(--accent)]" />
              </span>
            ) : null}
            {converted ? (
              <span className="shrink-0">
                · {formatMoney(transaction.amount, transaction.currency)}
              </span>
            ) : null}
          </span>
        </span>

        <span
          className="display shrink-0 text-[1.0625rem] tabular-nums"
          style={{ color: income ? "var(--accent)" : "var(--text-1)" }}
        >
          {income ? "+" : "−"}
          {formatMoney(transaction.amount_base, transaction.base_currency)}
        </span>

        <Chevron className="size-3.5 shrink-0 -rotate-90 text-[var(--text-3)]" />
      </Link>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function Onboarding() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <Link
          href="/hub"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Hub
        </Link>
        <span className="eyebrow">Herramienta 02</span>
      </header>

      <section className="mt-2">
        <h1
          className="display rise emboss text-[clamp(2.75rem,13vw,3.75rem)]"
          style={{ "--d": "110ms" } as CSSProperties}
        >
          My
          <span className="block pl-[0.5em] text-[var(--accent)]">Pocket</span>
        </h1>
        <p
          className="rise mt-5 max-w-[20rem] text-[0.9375rem] leading-relaxed text-[var(--text-2)]"
          style={{ "--d": "190ms" } as CSSProperties}
        >
          Para llevar tu bolsillo necesitamos lo mismo que la otra herramienta:
          cuánto ganás. Se guarda una sola vez y sirve para las dos.
        </p>
      </section>

      <section
        className="plate rise mt-2 p-5"
        style={{ "--d": "260ms" } as CSSProperties}
      >
        <p className="eyebrow">Paso único</p>
        <h2 className="display mt-3 text-[1.75rem]">¿Cuánto ganás al mes?</h2>
        <p className="mt-2 mb-6 text-[0.875rem] leading-relaxed text-[var(--text-2)]">
          Con esto fijamos tu moneda base. Las fechas de pago y los montos
          exactos los configurás en el paso siguiente.
        </p>
        <WorkProfileForm onboarding />
      </section>
    </main>
  );
}
