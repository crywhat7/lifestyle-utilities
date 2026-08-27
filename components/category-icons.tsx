/**
 * Iconografía de categorías — dibujada a medida, nunca emoji.
 *
 * Las claves de este mapa son el vocabulario cerrado que puede usar la IA al
 * inventar una categoría nueva: si devuelve una que no existe, cae en 'other'.
 */

type IconProps = { className?: string };

const S = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <g {...S}>{children}</g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Egresos                                                                     */
/* -------------------------------------------------------------------------- */

function Food({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M6 3v8a2.5 2.5 0 0 0 5 0V3M8.5 3v6" />
      <path d="M6 13v8M8.5 13v8" />
      <path d="M18 21V3c-2 1-3 3.4-3 6.5S16.5 14 18 14" />
    </Frame>
  );
}

function Market({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 4h2.2l2.3 11.2A2 2 0 0 0 9.5 17h8.1a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="18" cy="20" r="1.3" />
    </Frame>
  );
}

function Transport({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M4 16v-4.2a2 2 0 0 1 .3-1L6.6 7A2 2 0 0 1 8.3 6h7.4a2 2 0 0 1 1.7 1l2.3 3.8c.2.3.3.7.3 1V16" />
      <path d="M4 16h16M4 16v2.5M20 16v2.5M6.5 10.5h11" />
      <circle cx="7.5" cy="16" r="1.2" />
      <circle cx="16.5" cy="16" r="1.2" />
    </Frame>
  );
}

function Home({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-5h4v5" />
    </Frame>
  );
}

function Bills({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M13 3 5 13.5h5.5L9.5 21 19 10.5h-5.6z" />
    </Frame>
  );
}

function Health({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M12 20s-7-4.4-7-9.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7 3.8C19 15.6 12 20 12 20Z" />
      <path d="M12 10.5v3M10.5 12h3" />
    </Frame>
  );
}

function Tech({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="5" width="18" height="11" rx="1.8" />
      <path d="M2 20h20M9.5 16.5 9 20M14.5 16.5l.5 3.5" />
    </Frame>
  );
}

function Clothes({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M9 3.5 12 6l3-2.5 5 3-2 3.5-2-1V21H8V9L6 10 4 6.5z" />
    </Frame>
  );
}

function Fun({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="2.5" y="7.5" width="19" height="10" rx="4" />
      <path d="M6.5 12.5h3M8 11v3M15 11.8h.01M17.5 13.8h.01" />
    </Frame>
  );
}

function Stream({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M8 20h8M12 16.5V20" />
      <path d="m10.5 8.5 4 2.2-4 2.2z" />
    </Frame>
  );
}

function Study({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z" />
      <path d="M6.5 11v5.2c0 .8 2.5 2.3 5.5 2.3s5.5-1.5 5.5-2.3V11" />
      <path d="M21.5 9v5" />
    </Frame>
  );
}

function Gift({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3.5" y="9" width="17" height="4" rx="1" />
      <path d="M5 13v7.5h14V13M12 9v11.5" />
      <path d="M12 9S10.5 4.5 8 4.5a2 2 0 0 0 0 4.5zM12 9s1.5-4.5 4-4.5a2 2 0 0 1 0 4.5z" />
    </Frame>
  );
}

function Pet({ className }: IconProps) {
  return (
    <Frame className={className}>
      <ellipse cx="12" cy="16" rx="4" ry="3.3" />
      <ellipse cx="5.6" cy="11.4" rx="1.9" ry="2.4" />
      <ellipse cx="18.4" cy="11.4" rx="1.9" ry="2.4" />
      <ellipse cx="9.4" cy="6.8" rx="1.8" ry="2.3" />
      <ellipse cx="15" cy="6.8" rx="1.8" ry="2.3" />
    </Frame>
  );
}

function Travel({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M10 3.2a1.6 1.6 0 0 1 3 1.5L12.4 10l6.6 3.6.9-1.5 1.6.9-2.3 4-6.2-2.2-3.5 3.9.4 2.8-1.6.6-1.8-3.5L3 16.6l.6-1.6 2.8.4 3.8-3.5-2.1-6.3 4-1.5z" />
    </Frame>
  );
}

function Beauty({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M9 3h6l-1 5H10z" />
      <rect x="8.5" y="8" width="7" height="13" rx="2" />
      <path d="M8.5 13h7" />
    </Frame>
  );
}

function Debt({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.2A3 3 0 0 0 9.6 10c0 2.6 5 1.4 5 4a3 3 0 0 1-5 1M12 6.5v11" />
    </Frame>
  );
}

function Savings({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M4 12.5c0-3.6 3.4-6.5 8-6.5 1 0 2 .15 2.9.42L18 4.5l.5 3.3c1 1.1 1.5 2.4 1.5 3.8l1.5 1.4-1.7 1.5c-.5 1.2-1.4 2.2-2.6 3l-.2 2.5h-3l-.4-1.5a11 11 0 0 1-2.8 0L10.4 20h-3l-.3-2.6A6.5 6.5 0 0 1 4 12.5Z" />
      <path d="M8 10.5h3.5M16 12h.01" />
    </Frame>
  );
}

function Sport({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c2.6 2.2 3.5 5 3.5 8.5s-.9 6.3-3.5 8.5c-2.6-2.2-3.5-5-3.5-8.5s.9-6.3 3.5-8.5Z" />
      <path d="M3.7 9.5h16.6M3.7 14.5h16.6" />
    </Frame>
  );
}

function Kids({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
    </Frame>
  );
}

function Coffee({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17M7 5V3M11 5V3M15 5V3" />
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Ingresos                                                                    */
/* -------------------------------------------------------------------------- */

function Salary({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" />
    </Frame>
  );
}

function Work({ className }: IconProps) {
  return (
    <Frame className={className}>
      <rect x="3" y="7" width="18" height="12.5" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18M12 11.5v2" />
    </Frame>
  );
}

function Sale({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M11.5 3H20a1 1 0 0 1 1 1v8.5L11.5 22 2 12.5z" />
      <path d="M16.5 7.5h.01" />
    </Frame>
  );
}

function Invest({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3.5 17 9 11l3.5 3.2L20 6.5" />
      <path d="M15 6.5h5v5" />
      <path d="M3.5 20.5h17" />
    </Frame>
  );
}

function Bank({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5.5 9.5v8M10 9.5v8M14 9.5v8M18.5 9.5v8M3 20.5h18" />
    </Frame>
  );
}

function Other({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7 12h.01M12 12h.01M17 12h.01" />
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */

export const CATEGORY_ICONS = {
  food: Food,
  market: Market,
  transport: Transport,
  home: Home,
  bills: Bills,
  health: Health,
  tech: Tech,
  clothes: Clothes,
  fun: Fun,
  stream: Stream,
  study: Study,
  gift: Gift,
  pet: Pet,
  travel: Travel,
  beauty: Beauty,
  debt: Debt,
  savings: Savings,
  sport: Sport,
  kids: Kids,
  coffee: Coffee,
  salary: Salary,
  work: Work,
  sale: Sale,
  invest: Invest,
  bank: Bank,
  other: Other,
} as const;

export type IconKey = keyof typeof CATEGORY_ICONS;

export const ICON_KEYS = Object.keys(CATEGORY_ICONS) as IconKey[];

export function CategoryIcon({
  iconKey,
  className,
}: {
  iconKey: string | null | undefined;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[iconKey as IconKey] ?? CATEGORY_ICONS.other;
  return <Icon className={className} />;
}
