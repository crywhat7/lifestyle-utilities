import type { CSSProperties, ReactNode } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";

/**
 * El marco de cualquier pantalla de formulario.
 *
 * Una sola pieza para las cinco: encabezado con el camino de vuelta, título
 * y el formulario debajo. Que todas se vean igual es lo que hace que crear
 * una gaveta y editar una caja se sientan la misma operación.
 */
export function FormShell({
  back,
  backLabel,
  eyebrow,
  title,
  tone,
  children,
}: {
  back: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <main
      className="relative flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
      style={{ "--tone": tone ?? "#b58338" } as CSSProperties}
    >
      <header className="r-rise flex items-center" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink
          href={back}
          className="r-key h-11 min-h-11 min-w-0 gap-2 pr-5 pl-4 text-[0.875rem]"
        >
          <ArrowBack className="size-4 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </NavLink>
      </header>

      <section className="r-rise" style={{ "--d": "40ms" } as CSSProperties}>
        <p className="r-eyebrow">{eyebrow}</p>
        <h1 className="r-title mt-1">{title}</h1>
      </section>

      <div className="r-rise" style={{ "--d": "80ms" } as CSSProperties}>
        {children}
      </div>
    </main>
  );
}
