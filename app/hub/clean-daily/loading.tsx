import type { CSSProperties } from "react";

/**
 * Clean Daily mientras Supabase devuelve hábitos, registros y tareas.
 *
 * Las cajas tienen el alto real de lo que van a contener, así que cuando
 * llegan los datos no salta nada de lugar. Cubre también a `/habitos` y
 * `/ritmo`, que comparten la misma silueta.
 */
export default function Loading() {
  return (
    <main className="relative flex flex-1 flex-col gap-6 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="ghost h-10 w-24 rounded-full" />
        <span className="flex gap-2">
          <span className="ghost size-10 rounded-full" />
          <span className="ghost size-10 rounded-full" />
        </span>
      </header>

      <section className="flex flex-col gap-2.5">
        <span className="ghost h-3 w-28 rounded-full" />
        <span
          className="ghost h-[4.5rem] rounded-[24px]"
          style={{ "--d": "80ms" } as CSSProperties}
        />
      </section>

      {/* El número del día: su alto exacto, para que no empuje la lista. */}
      <section>
        <span className="ghost block h-3 w-40 rounded-full" />
        <span
          className="ghost mt-4 block h-[clamp(3.25rem,19vw,5rem)] w-52"
          style={{ "--d": "120ms" } as CSSProperties}
        />
        <span
          className="ghost mt-3 block h-3 w-full rounded-full"
          style={{ "--d": "160ms" } as CSSProperties}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="ghost h-[4.5rem] rounded-[24px]"
            style={{ "--d": `${200 + index * 90}ms` } as CSSProperties}
          />
        ))}
      </section>
    </main>
  );
}
