import type { CSSProperties } from "react";

/**
 * La tabla no existe todavía. No es culpa de quien abre la pantalla, así que
 * no se le pide que llene nada: se le dice exactamente qué falta correr.
 */
export function MissingMigration() {
  return (
    <section className="e-card kindle flex flex-col gap-3 p-5" style={{ "--d": "80ms" } as CSSProperties}>
      <p className="e-eyebrow">Falta un paso</p>
      <h1 className="e-display text-[2rem]">El fogón no tiene dónde guardar.</h1>
      <p className="text-[0.875rem] leading-relaxed text-[var(--e-ink-2)]">
        Corré{" "}
        <code className="rounded-md bg-[var(--e-sunk)] px-1.5 py-0.5 text-[0.8125rem]">
          supabase/migrations/0015_fuel.sql
        </code>{" "}
        en el SQL Editor de Supabase y volvé a abrir esta pantalla.
      </p>
    </section>
  );
}
