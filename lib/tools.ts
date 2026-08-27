export type ToolStatus = "live" | "beta" | "soon";

export type Tool = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  iconKey: "cart" | "spark" | "wallet";
  status: ToolStatus;
};

/**
 * Catálogo de herramientas. Vive en el código a propósito: las herramientas
 * las construimos nosotros, los usuarios solo entran a la que necesitan.
 */
export const TOOLS: Tool[] = [
  {
    slug: "should-i-buy-it",
    name: "Should I Buy It",
    tagline: "Todo se paga con horas de tu vida",
    description:
      "Convierte el precio de lo que querés comprar en el tiempo que te cuesta ganarlo.",
    href: "/hub/should-i-buy-it",
    iconKey: "cart",
    status: "live",
  },
  {
    slug: "my-pocket",
    name: "My Pocket",
    tagline: "Lo que entra, lo que sale, lo que queda",
    description:
      "Tu balance real en un número: ingresos, egresos y en qué se te va la plata.",
    href: "/hub/my-pocket",
    iconKey: "wallet",
    status: "live",
  },
];

export const STATUS_LABEL: Record<ToolStatus, string> = {
  live: "Abrir",
  beta: "Beta",
  soon: "Pronto",
};
