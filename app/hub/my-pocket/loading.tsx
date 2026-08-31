import type { CSSProperties } from "react";

/**
 * My Pocket mientras Supabase devuelve perfil, categorías y movimientos.
 *
 * Es la pantalla más cara de la app —varias consultas encadenadas— y por eso
 * la que más se notaba congelada. Cubre también a las rutas hijas que no
 * traen su propio esqueleto.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-32">
      <header className="flex items-center justify-between">
        <span className="bone h-10 w-24 rounded-full" />
        <span className="bone size-10 rounded-full" />
      </header>

      {/* El saldo: el momento firma de la página, con su alto real. */}
      <section className="mt-3">
        <span className="bone block h-3 w-32" />
        <span
          className="bone mt-3 block h-[clamp(2.75rem,15vw,4.25rem)] w-64"
          style={{ "--d": "90ms" } as CSSProperties}
        />
        <span
          className="bone mt-3 block h-3 w-48"
          style={{ "--d": "140ms" } as CSSProperties}
        />
      </section>

      {/* Próximo pago */}
      <span
        className="bone block h-[5.25rem] rounded-[26px]"
        style={{ "--d": "200ms" } as CSSProperties}
      />

      <div className="grid grid-cols-2 gap-3">
        <span
          className="bone block h-12 rounded-full"
          style={{ "--d": "260ms" } as CSSProperties}
        />
        <span
          className="bone block h-12 rounded-full"
          style={{ "--d": "300ms" } as CSSProperties}
        />
      </div>

      {/* Movimientos */}
      <section className="mt-2 flex flex-col gap-3">
        <span className="bone block h-11 rounded-full" />
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="bone block h-[4.25rem] rounded-[20px]"
            style={{ "--d": `${340 + index * 70}ms` } as CSSProperties}
          />
        ))}
      </section>
    </main>
  );
}
