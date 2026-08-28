/**
 * Instalar la app en la pantalla de inicio.
 *
 * Dos mundos que no se parecen en nada. Chrome y Edge exponen un evento y un
 * diálogo nativo: un toque y queda instalada. Safari en iPhone no expone nada
 * — Apple no da API — así que lo único honesto es reconocer ese caso y
 * explicar los tres pasos del menú Compartir en vez de fingir un botón que no
 * puede funcionar.
 */

/** El evento que Chrome dispara y `app/layout.tsx` guarda antes de hidratar. */
export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __installPrompt: InstallEvent | null;
  }
}

export type InstallState =
  | "checking"
  /** Ya corre instalada, o el navegador no ofrece nada que hacer. */
  | "none"
  /** Chrome/Edge/Android: hay diálogo nativo esperando. */
  | "ready"
  /** iPhone sin instalar: solo quedan las instrucciones. */
  | "ios";

/** Corriendo desde el ícono, no desde una pestaña. */
export function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Qué se le puede ofrecer a esta persona ahora mismo.
 *
 * En iPhone se exige además que sea Safari: dentro de Chrome iOS o del
 * navegador de Instagram el menú Compartir no trae "Agregar a inicio", y
 * mandarla a buscar una opción que no existe es peor que no decir nada.
 */
export function readInstallState(): InstallState {
  if (isInstalled()) return "none";
  if (window.__installPrompt) return "ready";

  if (isIOS()) {
    const agent = navigator.userAgent;
    const isSafari = !/crios|fxios|edgios|opios|fban|fbav|instagram/i.test(agent);
    return isSafari ? "ios" : "none";
  }

  return "none";
}

/**
 * Abre el diálogo nativo. El evento se consume: Chrome no lo vuelve a dar, así
 * que se descarta pase lo que pase con la respuesta.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed"> {
  const event = window.__installPrompt;
  if (!event) return "dismissed";

  window.__installPrompt = null;
  await event.prompt();

  const { outcome } = await event.userChoice;
  return outcome;
}

/**
 * Registra el service worker.
 *
 * Sin uno registrado Chrome ni siquiera considera instalable la app, así que
 * esto es lo que enciende el evento anterior. Falla en silencio: un navegador
 * sin service workers no tiene nada roto, tiene menos funciones.
 */
export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // Sin service worker no hay instalación ni avisos; el resto sigue igual.
  }
}
