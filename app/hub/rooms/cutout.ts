/**
 * Quitar el fondo de una prenda, en el propio teléfono.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * LICENCIA — leer antes de tocar esto.
 *
 * `@imgly/background-removal` es AGPL-3.0. Es gratis en dinero, no en
 * obligaciones: la AGPL es copyleft y su cláusula de red alcanza al software
 * que se sirve por internet. Este repositorio es público y hoy no declara
 * licencia. Si algún día esta app se cierra, se vende o se licencia de otra
 * forma, esta dependencia hay que revisarla o reemplazarla.
 *
 * El reemplazo natural, si llega ese día: RMBG-1.4 vía
 * `@huggingface/transformers` (ojo, el modelo es CC BY-NC, o sea no
 * comercial), o una API de pago como remove.bg. Lo que cambia es este
 * archivo y nada más — por eso el recorte vive detrás de una sola función.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Por qué en el navegador y no en el servidor: la foto no sale del teléfono,
 * no hay costo por imagen y no hay una cola de trabajos que mantener. Lo que
 * se paga es la primera corrida —el modelo pesa varios MB y se descarga del
 * CDN de la librería— y unos segundos de CPU por prenda. De ahí en más el
 * navegador lo tiene en caché.
 *
 * Y por eso es BAJO DEMANDA, con un botón, y no automático al guardar: nadie
 * quiere esperar ocho segundos por anotar que tiene una camisa.
 */

const MAX_EDGE = 900;

/** Cuánto va a tardar y por qué, dicho antes de empezar. */
export const CUTOUT_FIRST_RUN =
  "La primera vez baja el modelo (unos MB). Después queda en el teléfono.";

/**
 * Recorta la prenda y devuelve un PNG con transparencia.
 *
 * `await import` y no un import arriba del archivo: la librería y su WASM no
 * pueden entrar al bundle de una pantalla que casi siempre se abre para otra
 * cosa. Así, quien nunca toca el botón nunca descarga nada.
 */
export async function cutOut(source: Blob, onStep?: (step: string) => void) {
  onStep?.("Cargando el recortador…");

  const { removeBackground } = await import("@imgly/background-removal");

  onStep?.("Buscando la prenda…");

  const cut = await removeBackground(source, {
    output: { format: "image/png" },
  });

  onStep?.("Recortando…");

  return shrink(cut);
}

/**
 * El PNG recortado, achicado a 900 px.
 *
 * Un PNG con transparencia a 1280 px pesa varios MB —no comprime como un
 * JPEG— y lo único que hace con él el armador de conjuntos es mostrarlo a
 * un tercio de pantalla. Achicarlo acá es la diferencia entre un lienzo que
 * abre al instante y uno que descarga ocho megas de ropa.
 */
async function shrink(png: Blob) {
  const bitmap = await createImageBitmap(png);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    if (!blob) throw new Error("sin recorte");

    return {
      file: new File([blob], "recorte.png", { type: "image/png" }),
      preview: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}
