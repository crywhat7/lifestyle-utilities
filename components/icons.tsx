type IconProps = {
  className?: string;
};

/** Mano saludando — dibujada a medida, sin emoji. */
export function WaveHand({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18.5 26V13a3 3 0 0 1 6 0v11" />
        <path d="M24.5 24V10.5a3 3 0 0 1 6 0V25" />
        <path d="M30.5 25V15a3 3 0 0 1 6 0v16.5" />
        <path d="M18.5 26v-3.5a3 3 0 0 0-6 0v9.8C12.5 39.4 17.8 44 24.5 44S36.5 39.4 36.5 32.3V29" />
      </g>
      <g
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.45"
      >
        <path d="M8.5 10.5 5.5 7" />
        <path d="M5.5 18H1.5" />
        <path d="M9 25.5 5.5 27.5" />
      </g>
    </svg>
  );
}

/** Marca de Google en sus cuatro colores oficiales. */
export function GoogleMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** Carrito con etiqueta de precio — icono de "Should I Buy It". */
export function CartTag({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7h4.4a2 2 0 0 1 1.95 1.55L11 11m0 0 3.6 15.6a3 3 0 0 0 2.92 2.3h15.1a3 3 0 0 0 2.92-2.28L39 15H11z" />
        <circle cx="18.5" cy="39" r="3" />
        <circle cx="33" cy="39" r="3" />
        <path d="M24 18.5v7.5M21 20.8c0-1.3 1.34-2.3 3-2.3s3 1 3 2.3-1.34 2.3-3 2.3-3 1-3 2.3 1.34 2.3 3 2.3 3-1 3-2.3" />
      </g>
    </svg>
  );
}

/** Chispa / destello — marca del producto. */
export function Spark({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M24 3c1.1 9.6 5.1 14.2 14.6 15.6C29 20.2 25.1 24.8 24 34.4c-1.1-9.6-5.1-14.2-14.6-15.8C18.9 17.2 22.9 12.6 24 3Z"
        fill="currentColor"
      />
      <path
        d="M11.5 30c.5 4.5 2.4 6.7 6.9 7.4-4.5.7-6.4 2.9-6.9 7.4-.5-4.5-2.4-6.7-6.9-7.4 4.5-.7 6.4-2.9 6.9-7.4Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

/** Signo de más para los espacios vacíos del bento. */
export function PlusSlot({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Botón de encendido — cerrar sesión. */
export function Power({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v9" />
        <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
      </g>
    </svg>
  );
}

/** Flecha diagonal para las tarjetas accionables. */
export function ArrowOut({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Lupa del buscador de productos. */
export function Search({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4.5 4.5" />
      </g>
    </svg>
  );
}

/** Flecha de regreso. */
export function ArrowBack({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tuerca de ajustes. */
export function Sliders({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
        <circle cx="16" cy="8" r="2" />
        <circle cx="10" cy="16" r="2" />
      </g>
    </svg>
  );
}

/** Papelera para borrar del historial. */
export function Trash({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7h16M10 7V5h4v2M6 7l1 12h10l1-12" />
      </g>
    </svg>
  );
}

/** Marca de verificación — argumentos a favor. */
export function Check({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="m5 12.5 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Aspa — argumentos en contra. */
export function Cross({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Galón que gira al abrir un ítem del historial. */
export function Chevron({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Billetera — icono de "My Pocket". */
export function Wallet({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 14a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" />
        <path d="M6 16.5V13a3 3 0 0 1 2.3-2.9l19-4.6A2.5 2.5 0 0 1 30.5 8v2" />
        <path d="M42 20.5h-8a3.5 3.5 0 0 0 0 7h8z" />
      </g>
    </svg>
  );
}

/** Flecha que entra — un ingreso. */
export function ArrowIn({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4v13" />
        <path d="m6.5 11.5 5.5 5.5 5.5-5.5" />
        <path d="M5 20h14" />
      </g>
    </svg>
  );
}

/** Flecha que sale — un egreso. */
export function ArrowUpRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20V7" />
        <path d="m6.5 12.5 5.5-5.5 5.5 5.5" />
        <path d="M5 4h14" />
      </g>
    </svg>
  );
}

/** Calendario — fechas de pago. */
export function Calendar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3.5V6M16 3.5V6" />
      </g>
    </svg>
  );
}

/** Ciclo — gastos fijos que vuelven cada mes. */
export function Repeat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
        <path d="M20 4.5v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
        <path d="M4 19.5v-4h4" />
      </g>
    </svg>
  );
}

/** Cuadrícula — el desglose por categoría. */
export function Grid({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      </g>
    </svg>
  );
}

/** El botón Compartir de iOS — la puerta a "Agregar a inicio". */
export function Share({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 15V3" />
        <path d="m8 7 4-4 4 4" />
        <path d="M6 11H5v10h14V11h-1" />
      </g>
    </svg>
  );
}

/** Un teléfono con la app adentro — instalar en la pantalla de inicio. */
export function Phone({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="2.5" width="12" height="19" rx="3" />
        <path d="M12 9v6M9 12h6" />
      </g>
    </svg>
  );
}
