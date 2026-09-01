import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Chevron, Spark } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { formatMoney } from "@/lib/money";
import {
  dayLabel,
  monthRange,
  type PocketCategory,
  type PocketTransaction,
} from "@/lib/pocket";
import {
  loadCategories,
  loadCategoryTransactions,
  loadLedger,
  loadPocketProfile,
  pocketClient,
  type LedgerRow,
} from "../data";

export const metadata: Metadata = {
  title: "Gastos por categoría · My Pocket",
  description: "En qué se te va la plata, ordenado de mayor a menor.",
};

type Slice = {
  category: PocketCategory | null;
  total: number;
  count: number;
};

/** Los tres periodos que se pueden mirar. `todo` no tiene rango: es todo. */
const SCOPES = {
  mes: { offset: 0, label: "Este mes" },
  anterior: { offset: -1, label: "Mes anterior" },
  todo: { offset: null, label: "Todo" },
} as const;

type Scope = keyof typeof SCOPES;

function toScope(value: unknown): Scope {
  return value === "todo" || value === "anterior" ? value : "mes";
}

/** La bolsa de los que no tienen categoría viaja como `none` en la URL. */
const NO_CATEGORY = "none";

export default async function CategoriesPage({
  searchParams,
}: PageProps<"/hub/my-pocket/categorias">) {
  const params = await searchParams;
  const scope = toScope(params?.p);
  const opened = typeof params?.c === "string" ? params.c : null;

  const { offset } = SCOPES[scope];
  const range = offset === null ? null : monthRange(offset);
  const periodLabel = range ? range.label : "Todo el histórico";

  const { supabase, user } = await pocketClient();

  /*
    Con una categoría abierta se piden también sus movimientos, en la misma
    tanda que el resto: el detalle no cuesta un viaje más que el reparto.
  */
  const [{ profile }, categories, ledger, openedRows] = await Promise.all([
    loadPocketProfile(supabase, user.id),
    loadCategories(supabase),
    loadLedger(supabase, user.id),
    opened
      ? loadCategoryTransactions(
          supabase,
          user.id,
          opened === NO_CATEGORY ? null : opened,
          range
        )
      : Promise.resolve<PocketTransaction[]>([]),
  ]);

  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-[0.9375rem] text-[var(--text-2)]">
          Configurá primero tu ingreso.
        </p>
        <NavLink
          href="/hub/my-pocket"
          className="key h-12 rounded-full px-6 pt-3.5"
        >
          Ir a My Pocket
        </NavLink>
      </main>
    );
  }

  const rows = ledger.filter(
    (row: LedgerRow) =>
      row.kind === "expense" &&
      (!range || (row.occurred_at >= range.from && row.occurred_at < range.to))
  );

  const byId = new Map(categories.map((category) => [category.id, category]));
  const buckets = new Map<string, Slice>();

  for (const row of rows) {
    const key = row.category_id ?? NO_CATEGORY;
    const slice = buckets.get(key) ?? {
      category: byId.get(row.category_id ?? "") ?? null,
      total: 0,
      count: 0,
    };
    slice.total += row.amount_base;
    slice.count += 1;
    buckets.set(key, slice);
  }

  const slices = [...buckets.values()].sort((a, b) => b.total - a.total);
  const total = slices.reduce((sum, slice) => sum + slice.total, 0);

  if (opened) {
    return (
      <CategoryDetail
        category={opened === NO_CATEGORY ? null : (byId.get(opened) ?? null)}
        transactions={openedRows}
        currency={profile.currency}
        periodLabel={periodLabel}
        periodTotal={total}
        scope={scope}
      />
    );
  }

  const top = slices[0] ?? null;

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <NavLink
          href="/hub/my-pocket"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Pocket
        </NavLink>
        <span className="eyebrow">{periodLabel}</span>
      </header>

      <section className="mt-3">
        <p className="eyebrow rise" style={{ "--d": "100ms" } as CSSProperties}>
          Gastado
        </p>
        <h1
          className="display rise emboss mt-3 text-[clamp(2.5rem,14vw,4rem)] tabular-nums"
          style={{ "--d": "140ms" } as CSSProperties}
        >
          {formatMoney(total, profile.currency)}
        </h1>
        {top?.category ? (
          <p
            className="rise mt-3 text-[0.8125rem] text-[var(--text-3)]"
            style={{ "--d": "190ms" } as CSSProperties}
          >
            Lo que más pesa:{" "}
            <span className="text-[var(--accent-ink)]">{top.category.name}</span>
            , el {Math.round((top.total / (total || 1)) * 100)}% del total.
          </p>
        ) : null}
      </section>

      <PeriodTabs scope={scope} delay={240} />

      {slices.length === 0 ? (
        <div
          className="groove rise flex flex-col items-center gap-2 px-6 py-12 text-center"
          style={{ "--d": "290ms" } as CSSProperties}
        >
          <Spark className="size-6 text-[var(--accent-ink)]" />
          <p className="text-[0.9375rem] text-[var(--text-2)]">
            Sin egresos en este periodo.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {slices.map((slice, index) => {
            const share = total > 0 ? slice.total / total : 0;
            const id = slice.category?.id ?? NO_CATEGORY;

            return (
              <li key={id}>
                {/* La tarjeta entera es el botón: abrirla contesta "en qué",
                    que es la pregunta que sigue a "cuánto". */}
                <NavLink
                  href={`/hub/my-pocket/categorias?p=${scope}&c=${id}`}
                  className="plate rise block p-4 transition-transform duration-300 [transition-timing-function:var(--ease-expo)] active:scale-[0.99]"
                  style={{ "--d": `${290 + index * 40}ms` } as CSSProperties}
                >
                  <div className="flex items-center gap-3">
                    <span className="groove flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--accent-ink)]">
                      <CategoryIcon
                        iconKey={slice.category?.icon_key ?? "other"}
                        className="size-[1.1875rem]"
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">
                        {slice.category?.name ?? "Sin categoría"}
                      </span>
                      <span className="block text-[0.75rem] text-[var(--text-3)]">
                        {slice.count}{" "}
                        {slice.count === 1 ? "movimiento" : "movimientos"}
                        {slice.category?.user_id ? " · tuya" : ""}
                        {slice.category?.is_ai ? " · creada por IA" : ""}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="display block text-[1.125rem] tabular-nums">
                        {formatMoney(slice.total, profile.currency)}
                      </span>
                      <span className="block text-[0.6875rem] text-[var(--text-3)] tabular-nums">
                        {Math.round(share * 100)}%
                      </span>
                    </span>

                    <Chevron
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--text-3)]"
                    />
                  </div>

                  <div className="rail mt-3">
                    <div
                      className="rail-fill"
                      style={{ "--fill": share } as CSSProperties}
                    />
                  </div>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/** Los tres periodos. Cambiar de uno a otro conserva la categoría abierta. */
function PeriodTabs({
  scope,
  opened = null,
  delay,
}: {
  scope: Scope;
  opened?: string | null;
  delay: number;
}) {
  const suffix = opened ? `&c=${opened}` : "";

  return (
    <div className="tabs rise" style={{ "--d": `${delay}ms` } as CSSProperties}>
      {(Object.keys(SCOPES) as Scope[]).map((key) => (
        <NavLink
          key={key}
          href={`/hub/my-pocket/categorias?p=${key}${suffix}`}
          className="tab text-center"
          data-active={scope === key ? "true" : "false"}
        >
          {SCOPES[key].label}
        </NavLink>
      ))}
    </div>
  );
}

/**
 * Una categoría por dentro: qué compras la formaron.
 *
 * El reparto contesta "cuánto"; esto contesta "en qué", que es lo único que
 * deja hacer algo al respecto. Cada movimiento sigue llevando a su pantalla de
 * detalle, así que desde acá se recategoriza lo que esté mal puesto.
 */
function CategoryDetail({
  category,
  transactions,
  currency,
  periodLabel,
  periodTotal,
  scope,
}: {
  category: PocketCategory | null;
  transactions: PocketTransaction[];
  currency: string;
  periodLabel: string;
  periodTotal: number;
  scope: Scope;
}) {
  const total = transactions.reduce((sum, row) => sum + row.amount_base, 0);
  const share = periodTotal > 0 ? total / periodTotal : 0;
  const id = category?.id ?? NO_CATEGORY;

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <NavLink
          href={`/hub/my-pocket/categorias?p=${scope}`}
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Categorías
        </NavLink>
        <span className="eyebrow">{periodLabel}</span>
      </header>

      <section className="mt-3 flex items-center gap-4">
        <span className="groove flex size-14 shrink-0 items-center justify-center rounded-full text-[var(--accent-ink)]">
          <CategoryIcon
            iconKey={category?.icon_key ?? "other"}
            className="size-6"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="eyebrow rise"
            style={{ "--d": "100ms" } as CSSProperties}
          >
            {category?.name ?? "Sin categoría"}
          </p>
          <h1
            className="display rise emboss mt-2 text-[clamp(1.75rem,10vw,2.75rem)] tabular-nums"
            style={{ "--d": "140ms" } as CSSProperties}
          >
            {formatMoney(total, currency)}
          </h1>
        </div>
      </section>

      <p
        className="rise text-[0.8125rem] text-[var(--text-3)]"
        style={{ "--d": "190ms" } as CSSProperties}
      >
        {transactions.length}{" "}
        {transactions.length === 1 ? "movimiento" : "movimientos"}
        {periodTotal > 0
          ? ` · el ${Math.round(share * 100)}% de lo gastado en el periodo`
          : ""}
      </p>

      <PeriodTabs scope={scope} opened={id} delay={240} />

      {transactions.length === 0 ? (
        <div
          className="groove rise flex flex-col items-center gap-2 px-6 py-12 text-center"
          style={{ "--d": "290ms" } as CSSProperties}
        >
          <Spark className="size-6 text-[var(--accent-ink)]" />
          <p className="text-[0.9375rem] text-[var(--text-2)]">
            Nada en esta categoría durante el periodo.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {transactions.map((transaction, index) => (
            <li key={transaction.id}>
              <NavLink
                href={`/hub/my-pocket/movimiento/${transaction.id}`}
                className="groove rise flex items-center gap-3 p-3 transition-transform duration-200 [transition-timing-function:var(--ease-expo)] active:scale-[0.99]"
                style={{ "--d": `${290 + index * 30}ms` } as CSSProperties}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">
                    {transaction.description}
                  </span>
                  <span className="block text-[0.75rem] text-[var(--text-3)]">
                    {dayLabel(transaction.occurred_at)}
                    {transaction.currency !== transaction.base_currency
                      ? ` · ${formatMoney(transaction.amount, transaction.currency)}`
                      : ""}
                  </span>
                </span>
                <span className="display shrink-0 text-[1rem] tabular-nums">
                  {formatMoney(transaction.amount_base, currency)}
                </span>
                <Chevron
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[var(--text-3)]"
                />
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
