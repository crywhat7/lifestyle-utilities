import type { CSSProperties } from "react";

/**
 * Registrar, mientras llegan categorías y plantillas.
 *
 * Sin este archivo la ruta heredaba el esqueleto del balance: aparecía un
 * saldo enorme de mentira y después se reemplazaba por un formulario. Las
 * medidas de acá son las de `entry-screen`, así que lo que se ve primero es
 * lo mismo que va a quedar.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="bone h-10 w-24 rounded-full" />
        <span className="bone h-3 w-28" />
      </header>

      <section className="mt-2">
        <span className="bone block h-[clamp(2.25rem,11vw,3rem)] w-52" />
      </section>

      {/* Las dos pestañas */}
      <span
        className="bone block h-12 rounded-full"
        style={{ "--d": "80ms" } as CSSProperties}
      />

      {/* Los dos atajos: dictar y leer captura */}
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((index) => (
          <span
            key={index}
            className="bone block h-[6.5rem] rounded-[20px]"
            style={{ "--d": `${140 + index * 60}ms` } as CSSProperties}
          />
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {/* El monto, con su alto real */}
        <span
          className="bone block h-[5.5rem] rounded-[20px]"
          style={{ "--d": "240ms" } as CSSProperties}
        />
        <span
          className="bone block h-[3.25rem] rounded-[18px]"
          style={{ "--d": "290ms" } as CSSProperties}
        />
        <span
          className="bone block h-[3.25rem] rounded-[18px]"
          style={{ "--d": "340ms" } as CSSProperties}
        />

        {/* La cuadrícula de categorías */}
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <span
              key={index}
              className="bone block aspect-square rounded-[18px]"
              style={{ "--d": `${390 + index * 30}ms` } as CSSProperties}
            />
          ))}
        </div>

        <span
          className="bone block h-14 rounded-full"
          style={{ "--d": "640ms" } as CSSProperties}
        />
      </div>
    </main>
  );
}
