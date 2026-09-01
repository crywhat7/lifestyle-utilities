"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * El aviso de que el toque sí llegó.
 *
 * Cuando la pantalla de destino no está prefetcheada —red lenta, o la
 * primera vez— el router se queda pidiendo al servidor y en la pantalla no
 * cambia nada: el botón parece muerto y la reacción natural es volver a
 * tocarlo. Esto marca la tecla que se apretó mientras dura la espera.
 *
 * El velo nace en opacidad cero y entra recién a los 120 ms, así que una
 * navegación instantánea —la mayoría, con el caché del router— no muestra
 * absolutamente nada. Solo aparece cuando de verdad hay que esperar.
 */
function PendingVeil() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return <span aria-hidden="true" className="link-veil" />;
}

/** Un `Link` que se ve ocupado mientras el servidor responde. */
export function NavLink({
  children,
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    /* `nav-link` solo aporta el `position: relative` que el velo necesita
       para calzar sobre la tecla; todo lo demás lo sigue poniendo quien usa
       el componente. */
    <Link {...props} className={["nav-link", className].filter(Boolean).join(" ")}>
      {children}
      <PendingVeil />
    </Link>
  );
}
