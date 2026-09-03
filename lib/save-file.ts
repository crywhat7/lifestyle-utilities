/**
 * Guardar un archivo desde el navegador, también cuando la app está
 * instalada.
 *
 * El problema concreto: en el iPhone, con la app agregada a la pantalla de
 * inicio, tocar un enlace de descarga abre Safari, parpadea y se cierra sin
 * dejar nada. No es un error nuestro —es cómo trata iOS a las descargas de
 * una ventana en modo standalone— y no se arregla con `target` ni con
 * `download`: esos atributos ahí no significan nada.
 *
 * Lo que sí funciona es la hoja de compartir del sistema: se baja el archivo
 * a memoria, se arma un `File` y se le pasa a `navigator.share`, que ofrece
 * "Guardar en Archivos" como cualquier app nativa.
 *
 * El pedido de red va antes de compartir, y eso gasta parte de la activación
 * del toque —WebKit da unos cinco segundos—. Por eso el orden importa: si
 * compartir falla por lo que sea, se cae a la descarga clásica, y si esa
 * también falla, a abrir la dirección. Siempre pasa algo.
 */

export type SaveOutcome = "shared" | "downloaded" | "opened" | "failed";

/** ¿La app está corriendo instalada, fuera del navegador? */
export function isStandalone() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** El camino largo: bajar a memoria y ofrecer la hoja de compartir. */
async function shareFile(url: string, name: string, mime?: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(String(response.status));

  const blob = await response.blob();
  const file = new File([blob], name, {
    type: mime || blob.type || "application/octet-stream",
  });

  if (!navigator.canShare?.({ files: [file] })) throw new Error("no-share");

  await navigator.share({ files: [file], title: name });
}

/** El camino corto: un ancla con `download`, que es lo normal en escritorio. */
function anchorDownload(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noreferrer noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Guarda el archivo por el camino que el aparato permita.
 *
 * Instalada, primero la hoja de compartir; en el navegador de siempre, la
 * descarga directa, que es lo que la gente espera y no interrumpe con un
 * diálogo del sistema.
 */
export async function saveFile(
  url: string,
  name: string,
  mime?: string
): Promise<SaveOutcome> {
  if (isStandalone()) {
    try {
      await shareFile(url, name, mime);
      return "shared";
    } catch (error) {
      // Cancelar la hoja de compartir es una decisión, no una falla: no hay
      // que insistir abriendo una pestaña que la persona no pidió.
      if (error instanceof DOMException && error.name === "AbortError") {
        return "shared";
      }
    }
  }

  try {
    anchorDownload(url, name);
    return "downloaded";
  } catch {
    /* sigue con el último recurso */
  }

  try {
    window.open(url, "_blank", "noreferrer");
    return "opened";
  } catch {
    return "failed";
  }
}

/** Lo mismo, para un archivo que armamos acá y no vive en ninguna URL. */
export async function saveBlob(
  blob: Blob,
  name: string
): Promise<SaveOutcome> {
  if (isStandalone()) {
    const file = new File([blob], name, { type: blob.type });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "shared";
        }
      }
    }
  }

  const url = URL.createObjectURL(blob);

  try {
    anchorDownload(url, name);
    return "downloaded";
  } finally {
    // Un poco después: revocar en el mismo turno cancela la descarga.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
