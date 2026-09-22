"use client";

import { useState, useTransition } from "react";
import { Check, PlusSlot as Plus } from "@/components/icons";
import { logMenuItem } from "./actions";

/**
 * "Lo comí" para un plato del menú.
 *
 * No pregunta nada: las cifras ya las calculó la IA al armar el menú. Queda
 * marcado un rato para que el segundo toque no registre el plato dos veces
 * por accidente; si de verdad repetiste, está la porción ×2 en la lista.
 */
export function EatButton({ index, compact = false }: { index: number; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          const outcome = await logMenuItem(index);
          setFailed(!outcome.ok);
          setDone(outcome.ok);
        })
      }
      data-on={done}
      className={`e-opt shrink-0 ${compact ? "h-9 px-3 text-[0.75rem]" : "h-10 px-4 text-[0.8125rem]"}`}
    >
      {done ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {pending ? "Sumando…" : done ? "Sumado" : failed ? "Reintentar" : "Lo comí"}
    </button>
  );
}
