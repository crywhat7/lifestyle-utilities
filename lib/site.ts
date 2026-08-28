/**
 * Fuente única de verdad para todo lo que se publica hacia afuera:
 * metadatos, Open Graph, manifest, sitemap y JSON-LD leen de acá.
 *
 * El dominio sale de NEXT_PUBLIC_SITE_URL para que cambiarlo sea una
 * variable de entorno y no un find & replace por medio repo.
 */

const FALLBACK_URL = "https://lifestyle-utilities.vercel.app";

function normalize(raw: string | undefined): string {
  if (!raw) return FALLBACK_URL;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return FALLBACK_URL;
  // En local NEXT_PUBLIC_SITE_URL apunta a localhost, pero las tarjetas
  // sociales de producción necesitan una URL absoluta pública.
  if (process.env.NODE_ENV === "production" && trimmed.startsWith("http://")) {
    return FALLBACK_URL;
  }
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export const siteUrl = normalize(process.env.NEXT_PUBLIC_SITE_URL);

export const site = {
  name: "Lifestyle Utilities",
  shortName: "Utilities",
  url: siteUrl,
  locale: "es_ES",
  lang: "es",
  tagline: "Herramientas pequeñas y afiladas para decidir mejor",
  description:
    "Herramientas pequeñas y afiladas para las decisiones que hacen grande tu día a día: convertí precios en horas de vida con Should I Buy It y controlá lo que entra y lo que sale con My Pocket.",
  shortDescription:
    "Convertí precios en horas de tu vida y controlá en qué se te va la plata. Gratis, sin formularios, con tu cuenta de Google.",
  author: "crywhat",
  themeColor: "#08090b",
  accentColor: "#c6f24e",
  keywords: [
    "finanzas personales",
    "control de gastos",
    "presupuesto personal",
    "cuánto vale mi tiempo",
    "horas de trabajo por compra",
    "should i buy it",
    "calculadora de compras",
    "gestor de gastos",
    "app de ahorro",
    "decisiones de compra",
    "salario por hora",
    "registro de ingresos y egresos",
  ],
} as const;

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${site.url}/`).toString();
}
