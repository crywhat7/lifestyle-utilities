import type { CSSProperties } from "react";

/**
 * El perfil mientras llega la fila.
 *
 * Las medidas son las de la pantalla real: cuando responde Supabase nada se
 * corre de lugar.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="bone h-10 w-24 rounded-full" />
        <span className="eyebrow">Perfil</span>
      </header>

      <section className="mt-2 mb-1">
        <span className="bone block h-[clamp(2.25rem,11vw,3rem)] w-64" />
        <span
          className="bone mt-5 block h-11 w-full rounded-full"
          style={{ "--d": "90ms" } as CSSProperties}
        />
      </section>

      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          className="bone block rounded-[26px]"
          style={
            {
              "--d": `${160 + index * 80}ms`,
              height: index === 0 ? "26rem" : "11rem",
            } as CSSProperties
          }
        />
      ))}
    </main>
  );
}
