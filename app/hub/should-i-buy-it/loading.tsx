import type { CSSProperties } from "react";

/**
 * Should I Buy It mientras cargan perfil e historial.
 *
 * No cubre a `[id]`: esa ruta ya tiene su propio esqueleto, el dial, porque
 * ahí la espera no es de red sino de la IA pensando, y eso merece contarse
 * distinto.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="bone h-10 w-24 rounded-full" />
        <span className="eyebrow">Herramienta 01</span>
      </header>

      <section className="mt-3">
        <span className="bone block h-[clamp(2.25rem,11vw,3rem)] w-64" />
        <span
          className="bone mt-4 block h-3 w-52"
          style={{ "--d": "90ms" } as CSSProperties}
        />
      </section>

      {/* El formulario de la compra */}
      <span
        className="bone block h-[22rem] rounded-[26px]"
        style={{ "--d": "150ms" } as CSSProperties}
      />

      <section className="mt-2 flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="bone block h-[4.25rem] rounded-[20px]"
            style={{ "--d": `${240 + index * 70}ms` } as CSSProperties}
          />
        ))}
      </section>
    </main>
  );
}
