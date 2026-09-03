import type { ReactNode } from "react";

/*
  Los glifos de la app.
  --------------------------------------------------------------------------
  Casi todos toman su geometría de Tabler Icons (MIT, tabler.io/icons), que
  está dibujada sobre una retícula de 24 y con un grosor único: eso es lo que
  hace que un carrito y una billetera se vean de la misma familia, algo que
  dibujando a mano uno por uno se pierde enseguida.

  No entra como dependencia. Son treinta glifos de los casi seis mil que trae
  el paquete, así que viven acá adentro: pesan lo que pesan sus trazos, se
  editan como cualquier otro componente y nadie tiene que confiar en que el
  bundler sepa descartar el resto.

  Lo que sí es nuestro se queda nuestro: la mano que saluda, la chispa de la
  marca y el logotipo de Google. Un producto no se reconoce por su papelera.
*/

type IconProps = {
  className?: string;
};

/**
 * El chasis común de los glifos de trazo.
 *
 * 24 de lado, grosor 2, puntas y uniones redondas: la receta de Tabler. Vive
 * en un solo lugar para que ningún icono se desalinee del resto por su cuenta,
 * y el tamaño real siempre lo pone quien lo usa con una clase `size-*`.
 */
function Stroke({
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

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

/** Carrito con el signo del precio — el glifo de "Should I Buy It". */
export function CartTag({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M13 17h-7v-14h-2" />
      <path d="M6 5l14 1l-.575 4.022m-4.925 2.978h-8.5" />
      <path d="M21 15h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5" />
      <path d="M19 21v1m0 -8v1" />
    </Stroke>
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

/** Signo de más: sumar una fila, abrir un formulario. */
export function PlusSlot({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </Stroke>
  );
}

/** Botón de encendido — cerrar sesión. */
export function Power({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M7 6a7.75 7.75 0 1 0 10 0" />
      <path d="M12 4l0 8" />
    </Stroke>
  );
}

/** Flecha diagonal para las placas accionables. */
export function ArrowOut({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M17 7l-10 10" />
      <path d="M8 7l9 0l0 9" />
    </Stroke>
  );
}

/** Lupa del buscador de productos. */
export function Search({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </Stroke>
  );
}

/** Flecha de regreso. */
export function ArrowBack({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M15 6l-6 6l6 6" />
    </Stroke>
  );
}

/** Controles deslizantes — los ajustes. */
export function Sliders({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 6l8 0" />
      <path d="M16 6l4 0" />
      <path d="M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 12l2 0" />
      <path d="M10 12l10 0" />
      <path d="M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 18l11 0" />
      <path d="M19 18l1 0" />
    </Stroke>
  );
}

/** Papelera para borrar del historial. */
export function Trash({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </Stroke>
  );
}

/** Marca de verificación — argumentos a favor, tareas hechas. */
export function Check({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M5 12l5 5l10 -10" />
    </Stroke>
  );
}

/** Aspa — argumentos en contra, cerrar un aviso. */
export function Cross({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </Stroke>
  );
}

/** Galón que gira al abrir un ítem del historial. */
export function Chevron({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M6 9l6 6l6 -6" />
    </Stroke>
  );
}

/** Billetera — el glifo de "My Pocket". */
export function Wallet({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12" />
      <path d="M20 12v4h-4a2 2 0 0 1 0 -4h4" />
    </Stroke>
  );
}

/** Flecha que baja hasta la línea — un ingreso, algo que entra. */
export function ArrowIn({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 20l16 0" />
      <path d="M12 14l0 -10" />
      <path d="M12 14l4 -4" />
      <path d="M12 14l-4 -4" />
    </Stroke>
  );
}

/** Flecha que sube hasta la línea — un egreso, algo que sale. */
export function ArrowUpRight({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 10l0 10" />
      <path d="M12 10l4 4" />
      <path d="M12 10l-4 4" />
      <path d="M4 4l16 0" />
    </Stroke>
  );
}

/** Calendario — fechas de pago. */
export function Calendar({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M4 11h16" />
      <path d="M11 15h1" />
      <path d="M12 15v3" />
    </Stroke>
  );
}

/** Ciclo — gastos fijos que vuelven cada mes. */
export function Repeat({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3" />
      <path d="M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3" />
    </Stroke>
  );
}

/** Cuadrícula — el desglose por categoría. */
export function Grid({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      <path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
    </Stroke>
  );
}

/** El botón Compartir de iOS — la puerta a "Agregar a inicio". */
export function Share({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M13 4v4c-6.575 1.028 -9.02 6.788 -10 12c-.037 .206 5.384 -5.962 10 -6v4l8 -7l-8 -7z" />
    </Stroke>
  );
}

/** Un teléfono con un más — instalar en la pantalla de inicio. */
export function Phone({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v7" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
      <path d="M11 4h2" />
      <path d="M12 17v.01" />
    </Stroke>
  );
}

/** Marco de escaneo: cuatro esquinas y la línea que barre. */
export function Scan({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 7v-1a2 2 0 0 1 2 -2h2" />
      <path d="M4 17v1a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v1" />
      <path d="M16 20h2a2 2 0 0 0 2 -2v-1" />
      <path d="M5 12l14 0" />
    </Stroke>
  );
}

/** Cámara — para adjuntar la captura del banco. */
export function Camera({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
      <path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </Stroke>
  );
}

/** Micrófono — dictar un gasto en vez de escribirlo. */
export function Mic({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M8 21l8 0" />
      <path d="M12 17l0 4" />
    </Stroke>
  );
}

/** Cuadrado de detener — el par del micrófono mientras graba. */
export function Stop({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Sol — tema claro. */
export function Sun({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
      <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
    </Stroke>
  );
}

/** Luna — tema oscuro. */
export function Moon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </Stroke>
  );
}

/** Automático — el disco partido al medio dice "las dos" sin escribirlo. */
export function Auto({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 17a5 5 0 0 0 0 -10v10" />
    </Stroke>
  );
}

/** Pizarra con su cheque — el glifo de Clean Daily. */
export function Slate({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
      <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
      <path d="M9 14h.01" />
      <path d="M9 17h.01" />
      <path d="M12 16l1 1l3 -3" />
    </Stroke>
  );
}

/** Amanecer — el corte de las 00:00, cuando la lista vuelve a estar limpia. */
export function Sunrise({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M3 17h1m16 0h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7m-9.7 5.7a4 4 0 0 1 8 0" />
      <path d="M3 21l18 0" />
      <path d="M12 9v-6l3 3m-6 0l3 -3" />
    </Stroke>
  );
}

/** Pulso — el ritmo del mes, que no es una racha sino una frecuencia. */
export function Pulse({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M3 12h4.5l1.5 -6l4 12l2 -9l1.5 3h4.5" />
    </Stroke>
  );
}

/** Chincheta — lo que se queda fijo arriba hasta que lo resolvés. */
export function Pin({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" />
      <path d="M9 15l-4.5 4.5" />
      <path d="M14.5 4l5.5 5.5" />
    </Stroke>
  );
}

/** Menos — restar una caída del día. */
export function Minus({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M5 12l14 0" />
    </Stroke>
  );
}

/** Gota — el hábito malo: algo que cae y se cuenta. */
export function Drop({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z" />
    </Stroke>
  );
}

/** Birrete — el glifo de Canvas Studio. */
export function Cap({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M22 9l-10 -4l-10 4l10 4l10 -4v6" />
      <path d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4" />
    </Stroke>
  );
}

/** Clip — los archivos que acompañan a un borrador. */
export function Clip({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" />
    </Stroke>
  );
}

/** Dos hojas — copiar el LaTeX al portapapeles. */
export function Copy({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
      <path d="M4.012 16.737a2 2 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
    </Stroke>
  );
}

/** Flecha a la bandeja — bajar el .tex al teléfono. */
export function Download({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    </Stroke>
  );
}

/** Flecha circular — volver a pedirle a Canvas lo que ya cambió. */
export function Refresh({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </Stroke>
  );
}
