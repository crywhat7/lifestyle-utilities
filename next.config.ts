import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Una captura del banco recortada y recomprimida ronda los 300 KB, pero
      // una pantalla completa de un teléfono moderno se va al mega. El límite
      // de la lectura vive en el servidor (scan-actions); esto solo deja que
      // el archivo llegue hasta ahí en vez de morir en el borde.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
