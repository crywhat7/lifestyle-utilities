/**
 * La foto del plato, preparada en el teléfono antes de subir.
 *
 * Una foto de cámara moderna pesa entre 3 y 8 MB y la IA no ve mejor un
 * plato a 4000 px que a 1280: achicarla acá es lo que hace que el botón
 * responda en segundos con datos móviles. De la misma pasada sale la
 * miniatura cuadrada de la lista, que es lo único de la foto que se guarda.
 */

const MAX_EDGE = 1280;
const THUMB_EDGE = 176;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function preparePhoto(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const full = document.createElement("canvas");
    full.width = Math.max(1, Math.round(bitmap.width * scale));
    full.height = Math.max(1, Math.round(bitmap.height * scale));
    full.getContext("2d")?.drawImage(bitmap, 0, 0, full.width, full.height);

    const blob = await toBlob(full, "image/jpeg", 0.84);
    if (!blob) throw new Error("sin blob");

    // La miniatura es el centro cuadrado: el plato casi siempre está ahí.
    const side = Math.min(bitmap.width, bitmap.height);
    const square = document.createElement("canvas");
    square.width = THUMB_EDGE;
    square.height = THUMB_EDGE;
    square
      .getContext("2d")
      ?.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        THUMB_EDGE,
        THUMB_EDGE
      );

    // Safari viejo no codifica WebP y devuelve PNG en silencio: ahí, JPEG.
    let thumb = square.toDataURL("image/webp", 0.72);
    if (!thumb.startsWith("data:image/webp")) thumb = square.toDataURL("image/jpeg", 0.72);

    return {
      image: new File([blob], "plato.jpg", { type: "image/jpeg" }),
      thumb,
      preview: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}
