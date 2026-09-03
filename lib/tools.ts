export type ToolStatus = "live" | "beta" | "soon";

export type Tool = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  iconKey: "cart" | "spark" | "wallet" | "slate";
  status: ToolStatus;
};

/**
 * Catálogo de herramientas.
 *
 * El orden es el del hub y no es decorativo: la primera es la que ocupa la
 * placa ancha del bento. My Pocket va adelante porque es la que se abre todos
 * los días; las otras dos se consultan cuando hace falta.
 *
 * Vive en el código a propósito: las herramientas las construimos nosotros,
 * los usuarios solo entran a la que necesitan.
 */
export const TOOLS: Tool[] = [
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
    slug: "clean-daily",
    name: "Clean Daily",
    tagline: "Lo de ayer no se arrastra",
    description:
      "Tus hábitos del día en una pizarra que se borra a las 00:00, y las tareas que no mueren hasta que las marcás.",
    href: "/hub/clean-daily",
    iconKey: "slate",
    status: "live",
  },
];

export const STATUS_LABEL: Record<ToolStatus, string> = {
  live: "Abrir",
  beta: "Beta",
  soon: "Pronto",
};
