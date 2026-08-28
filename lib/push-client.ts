/**
 * My Pocket — el lado del navegador de los avisos push.
 *
 * Vive acá y no dentro de un componente porque hay dos sitios que preguntan lo
 * mismo: el interruptor de Ajustes y el aviso de la pantalla principal. Si la
 * lógica se duplicara, tarde o temprano una de las dos mentiría.
 */

export type PushStatus =
  | "checking"
  | "unsupported"
  | "needs-install"
  | "off"
  | "on"
  | "blocked";

/** iOS solo habilita el push cuando la web corre instalada en la pantalla de inicio. */
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Qué se puede hacer en este dispositivo, sin pedir nada todavía. */
export async function readPushStatus(): Promise<PushStatus> {
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!supported) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (isIOS() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "blocked";

  const registration = await navigator.serviceWorker.getRegistration();
  const existing = await registration?.pushManager.getSubscription();

  return existing ? "on" : "off";
}

export type EnableResult =
  | { status: "on" }
  | { status: "blocked" | "off" }
  | { status: "error"; error: string };

/**
 * Pide el permiso y registra la suscripción.
 *
 * Solo se puede llamar dentro de un gesto real de la persona: fuera de un
 * click el navegador rechaza la petición sin preguntar nada.
 */
export async function enablePush(
  save: (input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    label?: string;
  }) => Promise<{ status: string; error?: string }>
): Promise<EnableResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { status: permission === "denied" ? "blocked" : "off" };
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      return { status: "error", error: "Falta la llave pública VAPID en el servidor." };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });

    const json = subscription.toJSON();
    const outcome = await save({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      label: deviceLabel(),
    });

    if (outcome.status === "error") {
      return { status: "error", error: outcome.error ?? "No se pudo guardar." };
    }

    return { status: "on" };
  } catch (cause) {
    return {
      status: "error",
      error: cause instanceof Error ? cause.message : "No se pudo activar.",
    };
  }
}

/** Nombre humano del dispositivo, para reconocerlo en la lista después. */
export function deviceLabel() {
  const agent = navigator.userAgent;
  if (/iphone/i.test(agent)) return "iPhone";
  if (/ipad/i.test(agent)) return "iPad";
  if (/android/i.test(agent)) return "Android";
  if (/mac/i.test(agent)) return "Mac";
  if (/windows/i.test(agent)) return "Windows";
  return "Navegador";
}

/** La llave VAPID viaja en base64url y `subscribe` la pide como bytes crudos. */
export function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
