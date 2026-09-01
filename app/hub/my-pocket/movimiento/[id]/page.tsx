import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { NavLink } from "@/components/nav-link";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Check, Spark, Trash } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { isPendingLabel } from "@/lib/pocket";
import {
  deleteTransaction,
  renameTransaction,
  setTransactionCategory,
} from "../../actions";
import {
  loadCategories,
  loadPendingPhrases,
  loadPocketProfile,
  loadTransaction,
  pocketClient,
} from "../../data";

export const metadata: Metadata = {
  title: "Movimiento · My Pocket",
  description: "Revisá, recategorizá o borrá un movimiento.",
};

export default async function TransactionPage({
  params,
}: PageProps<"/hub/my-pocket/movimiento/[id]">) {
  const { id } = await params;
  const { supabase, user } = await pocketClient();

  // El perfil viaja con las otras tres en vez de por delante de ellas.
  const [{ profile }, transaction, categories, phrases] = await Promise.all([
    loadPocketProfile(supabase, user.id),
    loadTransaction(supabase, user.id, id),
    loadCategories(supabase),
    loadPendingPhrases(supabase),
  ]);

  if (!profile) redirect("/hub/my-pocket");

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
  // Todavía lleva el nombre provisional del banco: acá se le pone el de verdad.
  const pending = isPendingLabel(transaction.description, phrases);

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

      {/*
         El nombre se edita siempre, pero solo se anuncia cuando hace falta:
         si el movimiento todavía se llama "COMPRA EN PROCESO", el campo llega
         abierto y explicado; si ya tiene su nombre, es una línea más.
      */}
      <section
        className="groove rise flex flex-col gap-3 p-4"
        style={{ "--d": "215ms" } as CSSProperties}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Nombre</span>
          {pending ? (
            <span
              className="flex items-center gap-1.5 text-[0.6875rem] tracking-[0.14em] uppercase"
              style={{ color: "var(--warn)" }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: "var(--warn)" }}
              />
              Por clasificar
            </span>
          ) : null}
        </div>

        <form action={renameTransaction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={transaction.id} />
          <input
            name="description"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="off"
            defaultValue={transaction.description}
            aria-label="Nombre del movimiento"
            className="field"
          />
          <button
            type="submit"
            className="key flex h-12 items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
          >
            <Check className="size-4" />
            Guardar nombre
          </button>
        </form>

        {pending ? (
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-3)]">
            El banco todavía no dice qué compra fue. Cuando lo diga, ponele el
            nombre real y elegí su categoría acá abajo.
          </p>
        ) : null}
      </section>

      {/* Recategorizar sin JavaScript: cada casillero es su propio submit. */}
      <section className="rise mt-2" style={{ "--d": "240ms" } as CSSProperties}>
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <span className="eyebrow">Categoría</span>
          <span className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-3)]">
            {current?.name ?? "Sin categoría"}
            {transaction.ai_categorized ? (
              <Spark className="size-2.5 text-[var(--accent-ink)]" />
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
                          ? "var(--on-accent)"
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
          Tocá una para cambiarla y quedate acá: la última palabra siempre es
          tuya, aunque la haya puesto la IA.
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
