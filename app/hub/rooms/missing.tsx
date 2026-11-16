import type { CSSProperties } from "react";

/**
 * Las tablas no existen todavía. No es culpa de quien abre la pantalla, así
 * que no se le pide que llene nada: se le dice exactamente qué falta correr.
 */
export function MissingMigration({
  migration = "0018_rooms.sql",
  what = "Los cuartos no tienen dónde guardarse.",
}: {
  migration?: string;
  what?: string;
} = {}) {
  return (
    <section
      className="r-card r-rise flex flex-col gap-3 p-6"
      style={{ "--d": "80ms" } as CSSProperties}
    >
      <p className="r-eyebrow">Falta un paso</p>
      <h1 className="r-title">{what}</h1>
      <p className="text-[0.9375rem] leading-relaxed text-[var(--r-ink-2)]">
        Corré{" "}
        <code className="rounded-md bg-[var(--r-sunk)] px-1.5 py-0.5 text-[0.875rem]">
          supabase/migrations/{migration}
        </code>{" "}
        en el SQL Editor de Supabase y volvé a abrir esta pantalla.
      </p>
    </section>
  );
}
