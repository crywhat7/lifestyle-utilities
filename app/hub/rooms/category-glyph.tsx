import { Pencil, Phone, Plate, Pulse, Tag } from "@/components/icons";

/**
 * Un dibujo por categoría.
 *
 * Las categorías eran píldoras de texto envueltas en cuatro renglones, y
 * elegir una era leerlas. Leer veintidós palabras por
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

/* Las seis que llegaron después, cuando quedó claro que un inventario de casa
   sin "plantas" obliga a guardar una lengua de suegra en "Otro" — y lo que
   cae en "Otro" es exactamente lo que después no se encuentra. */

function Leaf({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M12 21v-7" />
      <path d="M12 14c0-5 3-9 8-10 .5 5-2 10-8 10z" />
      <path d="M12 14C12 9.5 9.5 6 5 5c-.4 4.5 1.8 9 7 9z" />
    </Frame>
  );
}

function Broom({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M12 2.5v7" />
      <path d="M7 9.5h10l1.5 11h-13z" />
      <path d="M10.5 9.5v11M14 9.5v11" />
    </Frame>
  );
}

function Paw({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="6.5" cy="9.5" r="2" />
      <circle cx="10.5" cy="5.5" r="2" />
      <circle cx="15.5" cy="5.5" r="2" />
      <circle cx="19" cy="9.5" r="2" />
      <path d="M8.5 15.5c0-2.5 2-4 4.3-4s4.2 1.5 4.2 4c0 2.3-1.6 4.5-4.2 4.5s-4.3-2.2-4.3-4.5z" />
    </Frame>
  );
}

function Can({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M6 6.5v12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-12" />
      <ellipse cx="12" cy="5.5" rx="6" ry="2.5" />
      <path d="M6 10.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </Frame>
  );
}

function Note({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="7" cy="18" r="3" />
      <path d="M10 18V6l10-3v11" />
      <circle cx="17" cy="14" r="3" />
    </Frame>
  );
}

function Picture({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
      <circle cx="9" cy="8" r="1.4" />
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
  music: Note,
  kitchen: Plate,
  food: Can,
  cleaning: Broom,
  plants: Leaf,
  pets: Paw,
  art: Brush,
  decor: Picture,
  other: Tag,
};

/**
 * Los dibujos que se pueden elegir para una categoría propia.
 *
 * Son los mismos veintidós de las categorías de fábrica, y a propósito: el
 * valor de un dibujo acá no es que ilustre bien "pesca", es que se distinga
 * de los otros veintiuno en una grilla de cuatro columnas. Un set abierto de
 * cientos de iconos daría categorías propias que se confunden entre sí, que
 * es justo lo que la categoría propia venía a arreglar.
 */
export const OWN_GLYPHS = Object.keys(BY_CATEGORY);

export function CategoryGlyph({ category, className }: { category: string; className?: string }) {
  const Icon = BY_CATEGORY[category] ?? Tag;
  return <Icon className={className} />;
}

/* -------------------------------------------------------------------------- */
/* Los tipos de lugar                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Un dibujo por tipo de habitación, de mueble, de gaveta y de caja.
 *
 * El mismo argumento que las categorías, y la misma grilla: elegir "cómoda"
 * entre diez palabras es leer diez palabras, y quien está registrando su casa
 * entera crea muebles y cajas por docenas. Un cajón dibujado se reconoce sin
 * leer.
 *
 * Las claves se comparten entre tipos a propósito: "repisa" de una gaveta y
 * "estantería" de un mueble son la misma idea a distinta escala, y dos
 * dibujos casi iguales para eso no ayudan a nadie — confunden.
 */

function Bed({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
      <path d="M3 15h18M3 18v2M21 18v2" />
      <rect x="6" y="6" width="5" height="3" rx="1.2" />
    </Frame>
  );
}

function Sofa({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <path d="M3 12.5a1.8 1.8 0 0 1 3.6 0V15h10.8v-2.5a1.8 1.8 0 0 1 3.6 0V18H3z" />
      <path d="M5 18v2M19 18v2" />
    </Frame>
  );
}

function Stove({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M3 12h18" />
      <circle cx="8" cy="10" r="0.8" />
      <circle cx="12" cy="10" r="0.8" />
      <circle cx="16" cy="10" r="0.8" />
      <path d="M8 16h8" />
    </Frame>
  );
}

function Shower({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M5 21V8a3 3 0 0 1 6 0v1" />
      <path d="M11 10h9l-2.5 3h-4z" />
      <path d="M13 16v1M15.5 15v2M18 16v1M14 20v1M17 19.5v1" />
    </Frame>
  );
}

function Desk({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M2 9h20M4 9v11M20 9v11" />
      <rect x="7" y="12" width="9" height="5" rx="1" />
      <path d="M9.5 14.5h4" />
    </Frame>
  );
}

function Garage({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M7 21v-7h10v7M7 17h10" />
    </Frame>
  );
}

function Boxes({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="12" width="8" height="8" rx="1" />
      <rect x="13" y="12" width="8" height="8" rx="1" />
      <rect x="8" y="4" width="8" height="8" rx="1" />
      <path d="M10.5 4v3M5.5 12v3M15.5 12v3" />
    </Frame>
  );
}

function Door({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
      <path d="M3 21h18" />
      <circle cx="15.5" cy="12" r="1" />
    </Frame>
  );
}

function Closet({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M12 3v18" />
      <path d="M10 11v2M14 11v2" />
    </Frame>
  );
}

function Dresser({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 9.5h16M4 15h16" />
      <path d="M10.5 6.8h3M10.5 12.2h3M10.5 17.6h3" />
    </Frame>
  );
}

function Shelves({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M4 3v18M20 3v18" />
      <path d="M4 9h16M4 15h16M4 21h16M4 3h16" />
      <path d="M7 6v3M16 12v3" />
    </Frame>
  );
}

function Table({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M2 8h20" />
      <path d="M4 8v12M20 8v12M4 12h16" />
    </Frame>
  );
}

function Cabinet({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="4" y="3" width="16" height="15" rx="1.5" />
      <path d="M12 3v15M10.5 9.5h-1M14.5 9.5h-1" />
      <path d="M6.5 18v3M17.5 18v3" />
    </Frame>
  );
}

function Nightstand({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="5" y="6" width="14" height="12" rx="1.5" />
      <path d="M5 12h14" />
      <path d="M10.5 9h3M10.5 15h3" />
      <path d="M7 18v2M17 18v2" />
    </Frame>
  );
}

function Trunk({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 11a9 5 0 0 1 18 0v8H3z" />
      <path d="M3 13.5h18" />
      <rect x="10.5" y="12" width="3" height="4" rx="0.8" />
    </Frame>
  );
}

function DrawerOpen({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 9h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M5 9V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
      <path d="M10 14h4" />
    </Frame>
  );
}

function Rail({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 6h18" />
      <path d="M8 6v2a2 2 0 0 0 4 0M8 8l-2.5 4M8 8l2.5 4" />
      <path d="M16 6v2a2 2 0 0 0 4 0M16 8l-2.5 4M16 8l2.5 4" />
    </Frame>
  );
}

function Cubby({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M12 4v16M3 12h18" />
    </Frame>
  );
}

function BoxOne({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
      <path d="M3 8.5v7L12 20l9-4.5v-7" />
      <path d="M12 13v7" />
    </Frame>
  );
}

function Bag({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M5 8h14l-1.3 12.2a1 1 0 0 1-1 .8H7.3a1 1 0 0 1-1-.8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Frame>
  );
}

function Case({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="2.5" y="7" width="19" height="12" rx="2" />
      <path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M2.5 13h19M11 11.5h2v3h-2z" />
    </Frame>
  );
}

function Basket({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 9h18l-2 11H5z" />
      <path d="M8 9 10 4M16 9 14 4" />
      <path d="M9 13v3M15 13v3" />
    </Frame>
  );
}

function Jar({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="7" y="3" width="10" height="3" rx="1" />
      <path d="M8 6v2.5C8 10 6.5 10.5 6.5 13v6a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-6c0-2.5-1.5-3-1.5-4.5V6" />
      <path d="M6.5 14h11" />
    </Frame>
  );
}

function Organizer({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M9 5v14M15 5v14M9 12h12" />
    </Frame>
  );
}

function Envelope({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Frame>
  );
}

const BY_VARIANT: Record<string, (props: IconProps) => React.ReactElement> = {
  /* Habitaciones */
  bedroom: Bed,
  living: Sofa,
  kitchen: Stove,
  bathroom: Shower,
  office: Desk,
  garage: Garage,
  storage: Boxes,
  /* Muebles */
  wardrobe: Closet,
  dresser: Dresser,
  shelf: Shelves,
  desk: Desk,
  bed: Bed,
  nightstand: Nightstand,
  table: Table,
  cabinet: Cabinet,
  trunk: Trunk,
  /* Gavetas y repisas */
  drawer: DrawerOpen,
  door: Door,
  rail: Rail,
  cubby: Cubby,
  /* Cajas y bolsas */
  box: BoxOne,
  bag: Bag,
  case: Case,
  basket: Basket,
  jar: Jar,
  organizer: Organizer,
  envelope: Envelope,
  /* El comodín de los cuatro */
  other: Tag,
};

export function VariantGlyph({ variant, className }: { variant: string; className?: string }) {
  const Icon = BY_VARIANT[variant] ?? Tag;
  return <Icon className={className} />;
}
