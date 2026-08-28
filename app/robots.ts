import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Solo la landing es pública. Todo lo que cuelga de /hub y /auth vive
 * detrás de sesión: no hay nada que indexar y sí datos que no exponer.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/hub", "/hub/", "/auth/", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
