import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Spark, Trash } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { deleteTransaction, setTransactionCategory } from "../../actions";
import { loadCategories, loadTransaction, pocketSession } from "../../data";

export const metadata: Metadata = {
  title: "Movimiento · My Pocket",
  description: "Revisá, recategorizá o borrá un movimiento.",
};

export default async function TransactionPage({
  params,
}: PageProps<"/hub/my-pocket/movimiento/[id]">) {
  const { id } = await params;
  const { supabase, user, profile } = await pocketSession();

  if (!profile) redirect("/hub/my-pocket");

  const [transaction, categories] = await Promise.all([
    loadTransaction(supabase, user.id, id),
    loadCategories(supabase),
  ]);

  if (!transaction) notFound();

  const income = transaction.kind === "income";
  const current =
    categories.find((category) => category.id === transaction.category_id) ??
    null;
  const options = categories.filter(
    (category) =>
      category.kind === transaction.kind || category.kind === "both"
  );
  const converted = transaction.currency !== transaction.base_currency;
  const date = new Date(`${transaction.occurred_at}T12:00:00`);

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
        <span className="eyebrow">{income ? "Ingreso" : "Egreso"}</span>
      </header>

      <section className="mt-2">
        <p className="eyebrow rise" style={{ "--d": "100ms" } as CSSProperties}>
          {date.toLocaleDateString("es-GT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1
          className="display rise emboss mt-3 text-[clamp(2.5rem,13vw,3.75rem)] tabular-nums"
          style={
            {
              "--d": "140ms",
              color: income ? "var(--accent)" : "var(--text-1)",
            } as CSSProperties
          }
        >
          {income ? "+" : "−"}
          {formatMoney(transaction.amount_base, transaction.base_currency)}
        </h1>
        <p
          className="rise mt-3 text-[0.9375rem] text-[var(--text-2)]"
          style={{ "--d": "190ms" } as CSSProperties}
        >
          {transaction.description}
          {converted ? (
            <span className="text-[var(--text-3)]">
              {" · "}
              {formatMoney(transaction.amount, transaction.currency)} al cambio
            </span>
          ) : null}
        </p>
      </section>

      {/* Recategorizar sin JavaScript: cada casillero es su propio submit. */}
      <section className="rise mt-2" style={{ "--d": "240ms" } as CSSProperties}>
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <span className="eyebrow">Categoría</span>
          <span className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-3)]">
            {current?.name ?? "Sin categoría"}
            {transaction.ai_categorized ? (
              <Spark className="size-2.5 text-[var(--accent)]" />
            ) : null}
          </span>
        </div>

        <form action={setTransactionCategory}>
          <input type="hidden" name="id" value={transaction.id} />
          <div className="grid grid-cols-4 gap-2">
            {options.map((category) => (
              <button
                key={category.id}
                type="submit"
                name="category_id"
                value={category.id}
                data-active={
                  category.id === transaction.category_id ? "true" : "false"
                }
                className="tile relative"
              >
                {category.user_id ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
                    style={{
                      background:
                        category.id === transaction.category_id
                          ? "rgba(10,13,5,.45)"
                          : "var(--accent)",
                    }}
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
        </form>

        <p className="mt-3 px-1 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          Tocá una para cambiarla. La última palabra siempre es tuya, aunque la
          haya puesto la IA.
        </p>
      </section>

      <form
        action={deleteTransaction}
        className="rise mt-2"
        style={{ "--d": "300ms" } as CSSProperties}
      >
        <input type="hidden" name="id" value={transaction.id} />
        <button
          type="submit"
          className="key flex w-full items-center justify-center gap-2 rounded-full py-4 text-[0.9375rem] text-[var(--danger)]"
        >
          <Trash className="size-4" />
          Borrar movimiento
        </button>
      </form>
    </main>
  );
}
