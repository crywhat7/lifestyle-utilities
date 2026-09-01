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

    /*
      Cuánto vale lo que el router ya tiene en memoria.

      Por defecto Next guarda cero segundos de una página dinámica, y todas
      las de acá lo son: volver al hub desde My Pocket significaba renderizar
      de nuevo en el servidor, con su viaje a Supabase, para mostrar
      exactamente lo mismo que hacía cinco segundos. Con esto, ir y volver es
      instantáneo dentro de la ventana.

      No hay riesgo de ver plata vieja: cada Server Action que escribe llama a
      `revalidatePath`, y eso vacía este caché en el acto para quien hizo el
      cambio.
    */
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
