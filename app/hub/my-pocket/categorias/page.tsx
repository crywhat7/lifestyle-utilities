import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Spark } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { monthLabel, monthStart, type PocketCategory } from "@/lib/pocket";
import {
  loadCategories,
  loadLedger,
  pocketSession,
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

export default async function CategoriesPage({
  searchParams,
}: PageProps<"/hub/my-pocket/categorias">) {
  const params = await searchParams;
  const scope = params?.p === "todo" ? "todo" : "mes";

  const { supabase, user, profile } = await pocketSession();

  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-[0.9375rem] text-[var(--text-2)]">
          Configurá primero tu ingreso.
        </p>
        <Link href="/hub/my-pocket" className="key h-12 rounded-full px-6 pt-3.5">
          Ir a My Pocket
        </Link>
      </main>
    );
  }

  const [categories, ledger] = await Promise.all([
    loadCategories(supabase),
    loadLedger(supabase, user.id),
  ]);

  const since = monthStart();
  const rows = ledger.filter(
    (row: LedgerRow) =>
      row.kind === "expense" && (scope === "todo" || row.occurred_at >= since)
  );

  const byId = new Map(categories.map((category) => [category.id, category]));
  const buckets = new Map<string, Slice>();

  for (const row of rows) {
    const key = row.category_id ?? "none";
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
  const top = slices[0] ?? null;

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
        <span className="eyebrow">
          {scope === "mes" ? monthLabel() : "Todo el histórico"}
        </span>
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
            <span className="text-[var(--accent)]">{top.category.name}</span>,
            el {Math.round((top.total / (total || 1)) * 100)}% del total.
          </p>
        ) : null}
      </section>

      <div
        className="tabs rise"
        style={{ "--d": "240ms" } as CSSProperties}
      >
        <Link
          href="/hub/my-pocket/categorias?p=mes"
          className="tab text-center"
          data-active={scope === "mes" ? "true" : "false"}
        >
          Este mes
        </Link>
        <Link
          href="/hub/my-pocket/categorias?p=todo"
          className="tab text-center"
          data-active={scope === "todo" ? "true" : "false"}
        >
          Todo
        </Link>
      </div>

      {slices.length === 0 ? (
        <div
          className="groove rise flex flex-col items-center gap-2 px-6 py-12 text-center"
          style={{ "--d": "290ms" } as CSSProperties}
        >
          <Spark className="size-6 text-[var(--accent)]" />
          <p className="text-[0.9375rem] text-[var(--text-2)]">
            Sin egresos en este periodo.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {slices.map((slice, index) => {
            const share = total > 0 ? slice.total / total : 0;

            return (
              <li
                key={slice.category?.id ?? "none"}
                className="plate rise p-4"
                style={
                  { "--d": `${290 + index * 40}ms` } as CSSProperties
                }
              >
                <div className="flex items-center gap-3">
                  <span className="groove flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--accent)]">
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
                </div>

                <div className="rail mt-3">
                  <div
                    className="rail-fill"
                    style={{ "--fill": share } as CSSProperties}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
