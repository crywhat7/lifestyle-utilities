/**
 * Una foto, preparada en el teléfono antes de subir.
 *
 * Una foto de cámara moderna pesa entre 3 y 8 MB y nadie necesita ese tamaño:
 * ni la IA ve mejor un plato a 4000 px que a 1280, ni un cable en una gaveta
 * se reconoce mejor. Achicarla acá es lo que hace que el botón responda en
 * segundos con datos móviles. De la misma pasada sale la miniatura cuadrada
 * de la lista.
 *
 * La usan Fuel (que descarta la foto y se queda con la miniatura) y Rooms
 * Planning (que guarda las dos): vive en `lib` justamente porque la decisión
 * de cuánto achicar no tiene por qué tomarse dos veces.
 */

const MAX_EDGE = 1280;
const THUMB_EDGE = 176;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function preparePhoto(file: File, thumbEdge = THUMB_EDGE) {
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
    square.width = thumbEdge;
    square.height = thumbEdge;
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
        thumbEdge,
        thumbEdge
      );

    // Safari viejo no codifica WebP y devuelve PNG en silencio: ahí, JPEG.
    let thumb = square.toDataURL("image/webp", 0.72);
    if (!thumb.startsWith("data:image/webp")) thumb = square.toDataURL("image/jpeg", 0.72);

    return {
      image: new File([blob], "foto.jpg", { type: "image/jpeg" }),
      thumb,
      preview: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}

/* -------------------------------------------------------------------------- */
/* El encuadre cuadrado                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Dónde está puesta la ventana cuadrada sobre la foto.
 *
 * `cx`/`cy` son el centro del recorte en fracciones de la foto y `zoom` es
 * cuánto se acerca: 1 es la ventana más grande que cabe —el lado corto
 * completo— y 3 es un detalle. En fracciones y no en píxeles porque la misma
 * decisión se toma mirando una ventana de 300 px y se ejecuta sobre una foto
 * de 1600.
 */
export type Square = { cx: number; cy: number; zoom: number };

export const CENTERED: Square = { cx: 0.5, cy: 0.5, zoom: 1 };

export const MAX_ZOOM = 3;

/** Lo que se guarda: un cuadrado de 1080, que es lo que muestra un teléfono. */
const SQUARE_EDGE = 1080;

/** Lo que se encuadra: ni la pantalla ni el recorte final piden más. */
const FRAME_EDGE = 1600;

/**
 * La ventana del recorte, en píxeles de la foto.
 *
 * El clamp no es cosmético: sin él, arrastrar el dedo más allá del borde deja
 * la ventana medio afuera de la imagen y el recorte sale con una franja
 * vacía — que es exactamente el "se corta por abajo" que se quiere evitar.
 * La ventana nunca sale de la foto, así que el cuadrado siempre está lleno.
 */
export function squareRect(width: number, height: number, square: Square) {
  const side = Math.min(width, height) / Math.min(MAX_ZOOM, Math.max(1, square.zoom));
  const half = side / 2;

  return {
    side,
    x: Math.min(Math.max(square.cx * width, half), width - half) - half,
    y: Math.min(Math.max(square.cy * height, half), height - half) - half,
  };
}

/**
 * La foto enderezada y achicada, lista para encuadrar.
 *
 * Pasa por un canvas antes de mostrarse por una razón que ya costó un bug en
 * esta app: una foto tomada de lado trae la rotación en el EXIF, el navegador
 * la dibuja derecha pero `naturalWidth` sigue devolviendo el ancho del
 * sensor. Encuadrar sobre esos números es encuadrar sobre una foto acostada.
 * Acá se hornea la orientación una sola vez y de ahí en más el ancho que se
 * ve es el ancho que se recorta.
 */
export async function openPhoto(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const scale = Math.min(1, FRAME_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await toBlob(canvas, "image/jpeg", 0.9);
    if (!blob) throw new Error("sin blob");

    return {
      source: blob,
      width: canvas.width,
      height: canvas.height,
      url: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}

/**
 * El recorte, hecho archivo.
 *
 * Sale un cuadrado exacto y de ahí sale también la miniatura, así que lo que
 * se vio al encuadrar es lo que queda en la lista: una sola decisión, un solo
 * resultado. Antes el cuadrado lo decidía el código tomando el centro de la
 * foto, y el centro de la foto casi nunca es el centro de la cosa.
 */
export async function cropSquare(source: Blob, square: Square, thumbEdge = THUMB_EDGE) {
  const bitmap = await createImageBitmap(source);

  try {
    const rect = squareRect(bitmap.width, bitmap.height, square);
    const edge = Math.min(SQUARE_EDGE, Math.round(rect.side));

    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, rect.x, rect.y, rect.side, rect.side, 0, 0, edge, edge);

    const blob = await toBlob(canvas, "image/jpeg", 0.86);
    if (!blob) throw new Error("sin blob");

    const small = document.createElement("canvas");
    small.width = thumbEdge;
    small.height = thumbEdge;
    small.getContext("2d")?.drawImage(canvas, 0, 0, thumbEdge, thumbEdge);

    // Safari viejo no codifica WebP y devuelve PNG en silencio: ahí, JPEG.
    let thumb = small.toDataURL("image/webp", 0.72);
    if (!thumb.startsWith("data:image/webp")) thumb = small.toDataURL("image/jpeg", 0.72);

    return {
      image: new File([blob], "foto.jpg", { type: "image/jpeg" }),
      thumb,
      preview: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}
