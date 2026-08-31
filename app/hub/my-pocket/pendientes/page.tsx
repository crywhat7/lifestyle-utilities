import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Check, Chevron } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { dayLabel } from "@/lib/pocket";
import {
  loadCategories,
  loadPendingPhrases,
  loadPendingTransactions,
  pocketSession,
} from "../data";

export const metadata: Metadata = {
  title: "Por clasificar · My Pocket",
  description: "Los movimientos que todavía llevan el nombre del banco.",
};

/**
 * Lo que entró con nombre provisional.
 *
 * Una compra retenida se registra como "COMPRA EN PROCESO" y días después el
 * banco recién dice qué fue. Esta pantalla junta todas esas: en vez de
 * buscarlas entre los movimientos del mes, se abren de a una, se les pone el
 * nombre real y se les elige categoría, y desaparecen de acá solas.
 *
 * Qué cuenta como provisional lo decide la tabla `pocket_pending_phrases`,
 * que se mantiene a mano desde Supabase. Si está vacía, esta pantalla dice
 * exactamente eso en vez de fingir que no hay nada que hacer.
 */
export default async function PendingPage() {
  const { supabase, user, profile } = await pocketSession();

  if (!profile) redirect("/hub/my-pocket");

  const [categories, phrases] = await Promise.all([
    loadCategories(supabase),
    loadPendingPhrases(supabase),
  ]);

  const transactions = await loadPendingTransactions(supabase, user.id, phrases);
  const byId = new Map(categories.map((category) => [category.id, category]));

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
        <span className="eyebrow">Sin nombre propio</span>
      </header>

      <section className="mt-2">
        <h1
          className="display rise emboss text-[clamp(2.25rem,11vw,3rem)]"
          style={{ "--d": "100ms" } as CSSProperties}
        >
          Por clasificar
        </h1>
        <p
          className="rise mt-3 text-[0.875rem] leading-relaxed text-[var(--text-2)]"
          style={{ "--d": "150ms" } as CSSProperties}
        >
          {phrases.length === 0
            ? "No hay frases cargadas todavía. Se agregan en la tabla pocket_pending_phrases desde Supabase."
            : transactions.length === 0
              ? "Nada con nombre provisional. Todo tu historial tiene su nombre y su categoría."
              : "El banco todavía no dice qué compra fue. Cuando lo diga, entrá y ponele el nombre real."}
        </p>
      </section>

      {transactions.length === 0 ? (
        <div
          className="groove rise flex flex-col items-center gap-2 px-6 py-10 text-center"
          style={{ "--d": "200ms" } as CSSProperties}
        >
          <Check className="size-6 text-[var(--accent-ink)]" />
          <p className="text-[0.9375rem] text-[var(--text-2)]">
            {phrases.length === 0 ? "Lista vacía" : "Todo clasificado"}
          </p>
        </div>
      ) : (
        <ul
          className="rise flex flex-col gap-2"
          style={{ "--d": "200ms" } as CSSProperties}
        >
          {transactions.map((transaction) => {
            const category = byId.get(transaction.category_id ?? "") ?? null;

            return (
              <li key={transaction.id}>
                <Link
                  href={`/hub/my-pocket/movimiento/${transaction.id}`}
                  className="groove flex items-center gap-3 p-3 transition-transform duration-200 [transition-timing-function:var(--ease-expo)] active:scale-[0.99]"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--text-2)]">
                    <CategoryIcon
                      iconKey={category?.icon_key ?? "other"}
                      className="size-[1.1875rem]"
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--warn)" }}
                      />
                      <span className="block truncate text-[0.9375rem] font-medium">
                        {transaction.description}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--text-3)]">
                      {dayLabel(transaction.occurred_at)} ·{" "}
                      {category?.name ?? "Sin categoría"}
                    </span>
                  </span>

                  <span className="display shrink-0 text-[1.0625rem] tabular-nums">
                    {transaction.kind === "income" ? "+" : "−"}
                    {formatMoney(
                      transaction.amount_base,
                      transaction.base_currency
                    )}
                  </span>

                  <Chevron className="size-3.5 shrink-0 -rotate-90 text-[var(--text-3)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
