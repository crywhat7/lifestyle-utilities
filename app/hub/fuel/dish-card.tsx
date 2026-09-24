"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { Check } from "@/components/icons";
import { formatKcal } from "@/lib/fuel";
import { deleteMeal, repeatMeal } from "./actions";
import type { ShownDish } from "./data";

/** Cuánto dura la ventana de "me equivoqué de plato". */
const UNDO_MS = 6_000;

type State =
  | { phase: "idle" }
  | { phase: "done"; id: string; kcal: number }
  | { phase: "kept"; kcal: number }
  | { phase: "error"; error: string };

/**
 * Registrar otra vez un plato con un toque, y poder arrepentirse.
 *
 * El toque registra de inmediato —es la promesa de "lo comí ahorita"— y la
 * tarjeta se enciende con las calorías que sumó. Durante seis segundos
 * ofrece deshacer, porque en una fila de platos parecidos equivocarse de
 * tarjeta es lo más fácil del mundo. Después queda marcada, tranquila.
 */
export function useRepeat(mealId: string) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [pending, start] = useTransition();

  useEffect(() => {
    if (state.phase !== "done") return;
    const timer = window.setTimeout(() => setState({ phase: "kept", kcal: state.kcal }), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  function repeat() {
    start(async () => {
      try {
        const result = await repeatMeal(mealId);
        setState(result.ok ? { phase: "done", id: result.id, kcal: result.kcal } : { phase: "error", error: result.error });
      } catch {
        setState({ phase: "error", error: "Sin conexión. Probá de nuevo." });
      }
    });
  }

  function undo() {
    if (state.phase !== "done") return;
    const id = state.id;
    start(async () => {
      try {
        await deleteMeal(id);
        setState({ phase: "idle" });
      } catch {
        setState({ phase: "error", error: "No se pudo deshacer." });
      }
    });
  }

  return { state, pending, repeat, undo };
}

/** Sin foto, la inicial del plato en el serif del módulo hace de miniatura. */
export function DishThumb({ dish, className }: { dish: ShownDish; className: string }) {
  if (dish.thumb) {
    // eslint-disable-next-line @next/next/no-img-element -- miniatura en data URL
    return <img src={dish.thumb} alt="" className={`${className} object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${className} dish-initial grid place-items-center`}>
      {dish.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** La tarjeta chica de la franja "Lo de siempre". */
export function DishCard({ dish, delay }: { dish: ShownDish; delay: number }) {
  const { state, pending, repeat, undo } = useRepeat(dish.lastId);
  const lit = state.phase === "done";

  return (
    <li className="dish-card kindle" data-lit={lit} style={{ "--d": `${delay}ms` } as CSSProperties}>
      <button
        type="button"
        onClick={repeat}
        disabled={pending || lit}
        aria-label={`Lo comí ahorita: ${dish.name}, ${formatKcal(dish.kcal)} kilocalorías`}
        className="flex w-full flex-col gap-2 p-2.5 text-left"
      >
        <span className="relative block">
          <DishThumb dish={dish} className="aspect-square w-full rounded-[16px]" />
          {lit ? (
            <span className="dish-burst e-figure absolute inset-0 grid place-items-center rounded-[16px] text-[1.75rem]">
              +{formatKcal(state.kcal)}
            </span>
          ) : null}
          {state.phase === "kept" ? (
            <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-[var(--e-lit)] text-[var(--e-on-lit)]">
              <Check className="size-3" />
            </span>
          ) : null}
        </span>
        <span className="dish-name text-[0.8125rem] leading-snug">{dish.name}</span>
        <span className="text-[0.6875rem] text-[var(--e-ink-3)] tabular-nums">
          {formatKcal(dish.kcal)} kcal{dish.count > 1 ? ` · ×${dish.count}` : ""}
        </span>
      </button>

      {lit ? (
        <button type="button" onClick={undo} disabled={pending} className="dish-undo">
          Deshacer
        </button>
      ) : null}
      {state.phase === "error" ? (
        <p role="alert" className="px-2.5 pb-2 text-[0.6875rem] text-[var(--e-over-ink)]">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
