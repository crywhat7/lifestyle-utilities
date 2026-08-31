import type { CSSProperties } from "react";

/**
 * El hub mientras resuelve la sesión.
 *
 * Next lo manda al instante, antes de esperar a Supabase, así que el toque
 * tiene respuesta inmediata en vez de dejar la pantalla anterior congelada.
 * Las medidas son las de la página real: cuando llegan los datos, nada se
 * corre de lugar.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="eyebrow">Lifestyle Utilities</span>
        <span className="bone h-10 w-[7.25rem] rounded-full" />
      </header>

      {/* El saludo: dos renglones, el alto exacto del titular real. */}
      <section className="mt-3">
        <span className="bone block h-[1.375rem] w-24" />
        <span
          className="bone mt-3 block h-[clamp(2.75rem,13vw,4rem)] w-56"
          style={{ "--d": "90ms" } as CSSProperties}
        />
      </section>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((index) => (
          <span
            key={index}
            className="bone col-span-2 block h-[19rem] rounded-[26px]"
            style={{ "--d": `${160 + index * 80}ms` } as CSSProperties}
          />
        ))}
        <span
          className="bone block aspect-square rounded-[20px]"
          style={{ "--d": "320ms" } as CSSProperties}
        />
        <span
          className="bone block aspect-square rounded-[20px]"
          style={{ "--d": "380ms" } as CSSProperties}
        />
      </div>

      <footer className="mt-auto pt-5">
        <span className="bone block h-[4.75rem] rounded-[26px]" />
      </footer>
    </main>
  );
}
