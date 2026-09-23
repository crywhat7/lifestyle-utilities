"use client";

import { useEffect, type CSSProperties } from "react";
import { report } from "@/components/error-reporter";
import { NavLink } from "@/components/nav-link";

/**
 * Si algo de Fuel revienta, la pantalla no se queda en blanco con el
 * "Reload" genérico de Next: se queda en el ambiente, dice qué pasó en
 * palabras normales y ofrece reintentar sin perder la sesión.
 */
export default function FuelError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    report({ kind: "boundary", message: error.message, stack: error.stack, digest: error.digest });
  }, [error]);

  return (
    <main className="relative flex flex-1 flex-col justify-center gap-6 px-5 py-10">
      <div aria-hidden="true" className="hearth-glow" />
      <section className="kindle" style={{ "--d": "40ms" } as CSSProperties}>
        <p className="e-eyebrow">Se apagó el fogón</p>
        <h1 className="e-display mt-4 text-[clamp(2.75rem,13vw,3.75rem)]">
          Algo no
          <br />
          <em className="text-[var(--e-ink-hot)]">respondió.</em>
        </h1>
        <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--e-ink-2)]">
          Suele ser la IA tardando de más o la señal cortándose a mitad de
          camino. Lo que ya estaba registrado sigue guardado.
        </p>
      </section>
      <div className="kindle grid grid-cols-2 gap-2" style={{ "--d": "140ms" } as CSSProperties}>
        <button
          type="button"
          onClick={() => retry()}
          className="e-key e-key-lit flex h-13 items-center justify-center text-[0.9375rem] font-medium"
        >
          Reintentar
        </button>
        <NavLink href="/hub" className="e-key flex h-13 items-center justify-center text-[0.875rem]">
          Volver al hub
        </NavLink>
      </div>
    </main>
  );
}
