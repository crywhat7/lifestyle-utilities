import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — ${site.tagline}`,
    short_name: site.shortName,
    description: site.shortDescription,
    id: "/",
    start_url: "/hub",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: site.themeColor,
    theme_color: site.themeColor,
    lang: site.lang,
    dir: "ltr",
    categories: ["finance", "productivity", "lifestyle"],
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Should I Buy It",
        short_name: "¿Lo compro?",
        description: "Convertí un precio en horas de tu vida",
        url: "/hub/should-i-buy-it",
      },
      {
        name: "My Pocket",
        short_name: "Pocket",
        description: "Tu balance del mes",
        url: "/hub/my-pocket",
      },
      {
        name: "Nuevo egreso",
        short_name: "Egreso",
        description: "Registrá un gasto",
        url: "/hub/my-pocket/nuevo/egreso",
      },
    ],
  };
}
