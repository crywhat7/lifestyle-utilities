import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * El resto de la app requiere sesión, así que el sitemap es la landing.
 * Cuando existan páginas públicas por herramienta, se agregan acá.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
