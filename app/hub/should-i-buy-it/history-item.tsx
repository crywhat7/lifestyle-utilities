"use client";

import { useState } from "react";
import { Chevron, Trash } from "@/components/icons";
import { relativeDate, type DecisionRecord } from "@/lib/decisions";
import { VERDICT_COPY, formatDuration, formatMoney } from "@/lib/money";
import { deleteDecision } from "./actions";
import { DecisionResult } from "./purchase-console";

/**
 * Cada consulta queda archivada entera. Tocar la ranura la vuelve a abrir
 * con el análisis completo, tal como salió la primera vez.
 */
export function HistoryItem({ decision }: { decision: DecisionRecord }) {
  const [open, setOpen] = useState(false);
  const copy = VERDICT_COPY[decision.verdict];
  const panelId = `decision-${decision.id}`;

  return (
    <li className="groove overflow-hidden">
      <div className="flex items-center gap-1 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] p-1.5 text-left transition-colors duration-300 [transition-timing-function:var(--ease-quart)]"
        >
          <span
            aria-hidden="true"
            className="h-9 w-1 shrink-0 rounded-full"
            style={{
              background: copy.color,
              boxShadow: `0 0 10px ${copy.color}66`,
            }}
          />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-medium">
              {decision.product_name}
            </span>
            <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--text-3)]">
              {formatMoney(Number(decision.price), decision.currency)} ·{" "}
              <span style={{ color: copy.color }}>{copy.label}</span> ·{" "}
              {relativeDate(decision.created_at)}
            </span>
          </span>

          <span className="display shrink-0 text-[1.125rem] tabular-nums text-[var(--text-2)]">
            {formatDuration(Number(decision.hours_cost))}
          </span>

          <Chevron
            className={`size-4 shrink-0 text-[var(--text-3)] transition-transform duration-500 [transition-timing-function:var(--ease-expo)] ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        <form action={deleteDecision}>
          <input type="hidden" name="id" value={decision.id} />
          <button
            type="submit"
            aria-label={`Borrar ${decision.product_name} del historial`}
            className="flex size-8 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--danger)]"
          >
            <Trash className="size-4" />
          </button>
        </form>
      </div>

      {open ? (
        <div
          id={panelId}
          className="fade border-t border-white/6 p-3 pt-4"
          style={{ "--d": "40ms" } as React.CSSProperties}
        >
          <DecisionResult decision={decision} />
        </div>
      ) : null}
    </li>
  );
}
