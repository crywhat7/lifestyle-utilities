"use client";

import { useEffect } from "react";
import { report } from "@/components/error-reporter";
import { NavLink } from "@/components/nav-link";

/**
 * Si algo de Rooms revienta, la pantalla no se queda en blanco con el
 * "Reload" genérico de Next: se queda en el ambiente, dice qué pasó en
 * palabras normales y ofrece reintentar sin perder la sesión.
 */
export default function RoomsError({
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
    <main className="relative flex flex-1 flex-col justify-center gap-6 px-4 py-10">
      <section className="r-card flex flex-col gap-3 p-6">
        <p className="r-eyebrow">No se pudo abrir</p>
        <h1 className="r-title">El cajón no se abrió.</h1>
        <p className="text-[0.9375rem] leading-relaxed text-[var(--r-ink-2)]">
          Suele ser la señal cortándose a mitad de camino. Nada de lo que ya
          estaba guardado se perdió.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => retry()} className="r-key r-key-lit">
          Reintentar
        </button>
        <NavLink href="/hub" className="r-key text-[0.9375rem]">
          Volver al hub
        </NavLink>
      </div>
    </main>
  );
}
