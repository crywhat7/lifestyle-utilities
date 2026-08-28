import "server-only";
import webpush from "web-push";
import type { createAdminClient } from "@/lib/supabase/admin";

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let configured = false;

/**
 * VAPID es lo que le prueba a Google/Apple/Mozilla que el push sale de este
 * servidor y no de cualquiera que se haya copiado un endpoint.
 */
function configure() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hola@wake.solutions",
      publicKey,
      privateKey
    );
    configured = true;
  }

  return true;
}

export type PushResult = { sent: number; gone: string[]; errors: string[] };

/**
 * Manda el mismo aviso a todos los dispositivos de una persona.
 *
 * Un 404/410 significa que el navegador tiró la suscripción —desinstaló la
 * app, limpió el sitio, cambió de teléfono—. Esas se devuelven en `gone` para
 * que quien llama las borre: guardarlas solo hace más lento el próximo envío.
 */
export async function sendPush(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload
): Promise<PushResult> {
  const result: PushResult = { sent: 0, gone: [], errors: [] };

  if (!configure()) {
    result.errors.push("Faltan las llaves VAPID.");
    return result;
  }

  const body = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        body,
        { TTL: 60 * 60 * 24 }
      );
      result.sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;

      if (status === 404 || status === 410) {
        result.gone.push(subscription.id);
        continue;
      }

      result.errors.push(
        `push ${subscription.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return result;
}

/** Las suscripciones muertas no se reintentan: se sacan de la lista. */
export async function dropSubscriptions(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[]
) {
  if (ids.length === 0) return;
  await supabase
    .from("pocket_push_subscriptions")
    .delete()
    .in("id", ids);
}
