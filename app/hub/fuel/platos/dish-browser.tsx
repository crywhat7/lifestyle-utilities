"use client";

import { useDeferredValue, useMemo, useState, type CSSProperties } from "react";
import { Check, PlusSlot, Search } from "@/components/icons";
import { dishKey, formatKcal, sinceLabel } from "@/lib/fuel";
import type { ShownDish } from "../data";
import { DishThumb, useRepeat } from "../dish-card";

type Sort = "now" | "often" | "recent";

const SORTS: { key: Sort; label: string }[] = [
  { key: "now", label: "Para ahora" },
  { key: "often", label: "Más comidos" },
  { key: "recent", label: "Recientes" },
];

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Todo lo que comiste alguna vez, un plato por fila.
 *
 * El orden por defecto es "para ahora": lo que solés comer a esta hora
 * arriba, y el primero en grande, porque casi siempre es ese. La búsqueda
 * no distingue tildes ni mayúsculas —"cafe" encuentra "Café con leche"—,
 * que es como se escribe con una mano sosteniendo el plato.
 */
export function DishBrowser({ dishes, today }: { dishes: ShownDish[]; today: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("now");
  const needle = dishKey(useDeferredValue(query));

  const shown = useMemo(() => {
    const matched = needle ? dishes.filter((dish) => dish.key.includes(needle)) : dishes;
    if (sort === "often") return [...matched].sort((a, b) => b.count - a.count || b.lastOn.localeCompare(a.lastOn));
    if (sort === "recent") return [...matched].sort((a, b) => b.lastOn.localeCompare(a.lastOn));
    return matched;
  }, [dishes, needle, sort]);

  const feature = !needle && sort === "now" ? shown[0] : null;
  const rest = feature ? shown.slice(1) : shown;

  return (
    <>
      <div className="kindle flex flex-col gap-3" style={{ "--d": "140ms" } as CSSProperties}>
        <label className="relative block">
          <span className="sr-only">Buscar un plato</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[var(--e-ink-3)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar: baleada, café, pollo…"
            className="e-field pl-11"
            type="search"
            enterKeyHint="search"
          />
        </label>
        <div role="radiogroup" aria-label="Orden" className="flex gap-1.5">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={sort === option.key}
              data-on={sort === option.key}
              onClick={() => setSort(option.key)}
              className="e-opt h-9 flex-1 text-[0.75rem]"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {feature ? <Feature dish={feature} today={today} /> : null}

      {shown.length === 0 ? (
        <p className="e-sunk px-4 py-6 text-center text-[0.875rem] text-[var(--e-ink-3)]">
          Nada con «{query}». Si es nuevo, registralo con foto desde el fogón.
        </p>
      ) : (
        <ul key={`${sort}:${needle}`} className="e-card overflow-hidden">
          {rest.map((dish, index) => (
            <Row key={dish.key} dish={dish} today={today} first={index === 0} delay={Math.min(index, 12) * 35} />
          ))}
        </ul>
      )}
    </>
  );
}

/** El más probable, en grande: casi siempre es este, así que no hay que buscarlo. */
function Feature({ dish, today }: { dish: ShownDish; today: string }) {
  const { state, pending, repeat, undo } = useRepeat(dish.lastId);
  const lit = state.phase === "done";

  return (
    <section
      className="e-card kindle relative overflow-hidden p-4"
      data-lit={lit}
      style={{ "--d": "200ms" } as CSSProperties}
    >
      <p className="e-eyebrow">A esta hora, lo más probable</p>
      <div className="mt-4 flex items-start gap-4">
        <span className="relative shrink-0">
          <DishThumb dish={dish} className="size-24 rounded-[22px]" />
          {lit ? (
            <span className="dish-burst e-figure absolute inset-0 grid place-items-center rounded-[22px] text-[1.625rem]">
              +{formatKcal(state.kcal)}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="e-display block text-[1.75rem] leading-[0.95]">{dish.name}</span>
          <span className="mt-2 block text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
            {formatKcal(dish.kcal)} kcal · {dish.count} {dish.count === 1 ? "vez" : "veces"} · suele ser {clock(dish.usual)}
          </span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={repeat}
          disabled={pending || lit}
          className="e-key e-key-lit flex h-12 items-center justify-center gap-2 text-[0.9375rem] font-medium"
        >
          {lit || state.phase === "kept" ? <Check className="size-4" /> : <PlusSlot className="size-4" />}
          {lit || state.phase === "kept" ? "Sumado a hoy" : "Lo comí ahorita"}
        </button>
        {lit ? (
          <button type="button" onClick={undo} disabled={pending} className="e-key h-12 px-4 text-[0.8125rem]">
            Deshacer
          </button>
        ) : (
          <span className="grid h-12 place-items-center px-2 text-[0.75rem] text-[var(--e-ink-3)]">
            {sinceLabel(dish.lastOn, today)}
          </span>
        )}
      </div>
      {state.phase === "error" ? (
        <p role="alert" className="mt-2 text-center text-[0.8125rem] text-[var(--e-over-ink)]">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}

function Row({ dish, today, first, delay }: { dish: ShownDish; today: string; first: boolean; delay: number }) {
  const { state, pending, repeat, undo } = useRepeat(dish.lastId);
  const lit = state.phase === "done";
  const kept = state.phase === "kept";

  return (
    <li
      className={`meal-row kindle ${first ? "" : "border-t border-[var(--e-hair)]"}`}
      data-open={lit}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <div className="flex items-center gap-3.5 px-4 py-3">
        <DishThumb dish={dish} className="meal-thumb" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem]">{dish.name}</span>
          <span className="mt-0.5 block text-[0.6875rem] text-[var(--e-ink-3)] tabular-nums">
            {formatKcal(dish.kcal)} kcal · ×{dish.count} · {sinceLabel(dish.lastOn, today)}
          </span>
        </span>
        {lit ? (
          <button type="button" onClick={undo} disabled={pending} className="e-opt h-9 shrink-0 px-3 text-[0.75rem]">
            Deshacer
          </button>
        ) : (
          <button
            type="button"
            onClick={repeat}
            disabled={pending || kept}
            data-on={kept}
            aria-label={`Lo comí ahorita: ${dish.name}`}
            className="e-opt h-9 shrink-0 px-3 text-[0.75rem]"
          >
            {kept ? <Check className="size-3" /> : <PlusSlot className="size-3" />}
            {pending ? "…" : kept ? "Sumado" : "Lo comí"}
          </button>
        )}
      </div>
      {state.phase === "error" ? (
        <p role="alert" className="px-4 pb-3 text-[0.75rem] text-[var(--e-over-ink)]">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
