import { Pencil, Phone, Plate, Pulse, Tag } from "@/components/icons";

/**
 * Un dibujo por categoría.
 *
 * Las dieciséis categorías eran dieciséis píldoras de texto envueltas en
 * cuatro renglones, y elegir una era leerlas. Leer dieciséis palabras por
 * objeto, cuando los objetos son cientos, es la diferencia entre un
 * inventario que se llena y uno que se abandona a los veinte.
 *
 * Un dibujo con el color de su categoría se reconoce sin leer, y —lo que de
 * verdad importa— se reconoce SIEMPRE EN EL MISMO LUGAR de la grilla. Por eso
 * el orden no se reordena nunca por uso reciente, aunque parezca servicial:
 * lo que hace rápido al segundo centenar de objetos es que la mano ya sepa
 * dónde está "cables" sin mirar.
 *
 * Los dibujos propios viven acá y no en `components/icons.tsx` porque son de
 * este módulo: una llave inglesa no la necesita nadie más en la app.
 */

type IconProps = { className?: string };

function Frame({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

function Cable({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M7 3v4M5 7h4v3a2 2 0 0 1-2 2 2 2 0 0 1-2-2z" />
      <path d="M7 12v3a5 5 0 0 0 5 5h1a4 4 0 0 0 4-4v-3" />
      <path d="M15 10h4v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2z" />
      <path d="M17 6v4" />
    </Frame>
  );
}

function Chip({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </Frame>
  );
}

function Wrench({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M15.5 3a5.5 5.5 0 0 0-5 7.7L3 18.2 5.8 21l7.5-7.5A5.5 5.5 0 1 0 15.5 3z" />
      <path d="M16 8.5h.01" />
    </Frame>
  );
}

function Shirt({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M9 3 5 5 3 9l3 1.5V21h12V10.5L21 9l-2-4-4-2" />
      <path d="M9 3a3 3 0 0 0 6 0" />
    </Frame>
  );
}

function Shoe({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M2 17v-6l4 1 3 2 5 .5c3 .3 6 1.4 8 3v1.5H2z" />
      <path d="M6 12V9M9 14v-3" />
    </Frame>
  );
}

function Watch({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 10v2l1.5 1" />
      <path d="M9 7.2 9.5 3h5l.5 4.2M9 16.8l.5 4.2h5l.5-4.2" />
    </Frame>
  );
}

function Doc({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Frame>
  );
}

function Pad({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 3.6l.9 4.6A2.6 2.6 0 0 1 19.2 18c-1 0-1.7-.6-2.4-1.3L15.4 15H8.6l-1.4 1.7C6.5 17.4 5.8 18 4.8 18a2.6 2.6 0 0 1-2.6-2.8l.9-4.6A4.5 4.5 0 0 1 7.5 7z" />
      <path d="M7 11v2.5M5.8 12.2h2.5M15.5 11h.01M17.5 13h.01" />
    </Frame>
  );
}

function Ball({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18M3.5 9h17M3.5 15h17" />
    </Frame>
  );
}

function Brush({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="m20 3-9 9 1 1 9-9z" />
      <path d="M8.5 14.5c-1.5-1.5-4 0-4.5 5 5-.5 6.5-3 5-4.5z" />
      <path d="m11 12-2.5-1-2 2 1 2.5" />
    </Frame>
  );
}

function Soap({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="4" y="12" width="16" height="9" rx="2.5" />
      <path d="M8 12V9a4 4 0 0 1 8 0v3" />
      <path d="M12 15.5v2" />
    </Frame>
  );
}

const BY_CATEGORY: Record<string, (props: IconProps) => React.ReactElement> = {
  cables: Cable,
  electronics: Phone,
  parts: Chip,
  tools: Wrench,
  stationery: Pencil,
  clothing: Shirt,
  shoes: Shoe,
  accessories: Watch,
  hygiene: Soap,
  health: Pulse,
  documents: Doc,
  games: Pad,
  sports: Ball,
  kitchen: Plate,
  art: Brush,
  other: Tag,
};

export function CategoryGlyph({ category, className }: { category: string; className?: string }) {
  const Icon = BY_CATEGORY[category] ?? Tag;
  return <Icon className={className} />;
}
