"use client";

import { useEffect, type CSSProperties } from "react";
import { report } from "@/components/error-reporter";
import { NavLink } from "@/components/nav-link";

/**
 * La red de todo /hub: si una herramienta revienta, en vez de la pantalla
 * en blanco de Next queda esta, con la placa de siempre, y el error ya va
 * camino al registro con el mismo `digest` que anotó el servidor.
 */
export default function HubError({
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
    <main className="flex flex-1 flex-col justify-center gap-6 px-5 py-10">
      <section className="rise" style={{ "--d": "40ms" } as CSSProperties}>
        <p className="eyebrow">Algo falló</p>
        <h1 className="display emboss mt-3 text-[clamp(2.5rem,12vw,3.5rem)]">No respondió.</h1>
        <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--text-2)]">
          Suele ser la conexión o un servicio tardando de más. Lo que ya estaba
          guardado sigue guardado, y el error quedó anotado.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[0.75rem] text-[var(--text-3)]">Código: {error.digest}</p>
        ) : null}
      </section>
      <div className="rise grid grid-cols-2 gap-2" style={{ "--d": "140ms" } as CSSProperties}>
        <button
          type="button"
          onClick={() => retry()}
          className="key key-accent flex h-12 items-center justify-center rounded-full text-[0.875rem] font-medium"
        >
          Reintentar
        </button>
        <NavLink href="/hub" className="key flex h-12 items-center justify-center rounded-full text-[0.875rem]">
          Volver al hub
        </NavLink>
      </div>
    </main>
  );
}
