"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { enrichDecision } from "../actions";

/**
 * Dispara la segunda fase (IA) apenas se pinta la página. No renderiza nada:
 * el estado de carga ya está dibujado en la vista.
 */
export function Enricher({ id }: { id: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    startTransition(async () => {
      await enrichDecision(id);
      router.refresh();
    });
  }, [id, router]);

  return null;
}
