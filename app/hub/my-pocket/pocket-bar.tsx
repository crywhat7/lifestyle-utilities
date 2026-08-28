"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowBack, ArrowIn, ArrowUpRight, Sliders } from "@/components/icons";

/**
 * La barra de acciones del balance.
 *
 * Antes flotaba abajo y se comía el final de la lista de movimientos. Ahora
 * vive pegada arriba: no se va con el scroll y tampoco tapa nada, porque el
 * contenido empieza justo debajo en vez de correr por detrás.
 *
 * Lo único que cambia al hacer scroll es la línea de abajo y su sombra — un
 * centinela de un píxel en el borde superior dice cuándo hay contenido
 * pasando por debajo. Sin listener de scroll, sin trabajo por cuadro.
 */
export function PocketBar() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinel}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 h-px w-full"
      />

      <div
        className="pocket-bar fade"
        data-scrolled={scrolled ? "true" : "false"}
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <Link
            href="/hub"
            aria-label="Volver al Hub"
            className="key flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--text-2)]"
          >
            <ArrowBack className="size-4" />
          </Link>

          <Link
            href="/hub/my-pocket/nuevo/ingreso"
            className="key flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-[0.875rem] font-medium"
          >
            <ArrowIn className="size-[1.0625rem] shrink-0 text-[var(--accent)]" />
            Ingreso
          </Link>

          <Link
            href="/hub/my-pocket/nuevo/egreso"
            className="key key-accent flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-[0.875rem] font-semibold"
          >
            <ArrowUpRight className="size-[1.0625rem] shrink-0" />
            Egreso
          </Link>

          <Link
            href="/hub/my-pocket/ajustes"
            aria-label="Ajustes de My Pocket"
            className="key flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--text-2)]"
          >
            <Sliders className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
