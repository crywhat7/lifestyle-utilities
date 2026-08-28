"use server";

import { isAdmin } from "@/lib/admin";
import { reminderPayload, salaryPayload } from "@/lib/notifications";
import { sendPush } from "@/lib/push";
import { isoDate } from "@/lib/pocket";
import { pocketSession } from "../data";

export type PushSaveState = { status: "idle" | "saved" | "error"; error?: string };

/**
 * Guarda la suscripción del navegador que la acaba de crear.
 *
 * El endpoint es único en la tabla: volver a activar las notificaciones en el
 * mismo navegador actualiza la fila en vez de sumar una nueva.
 */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}): Promise<PushSaveState> {
  const { supabase, user } = await pocketSession();

  const endpoint = String(input.endpoint ?? "").trim();
  const p256dh = String(input.p256dh ?? "").trim();
  const auth = String(input.auth ?? "").trim();

  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return { status: "error", error: "El navegador no devolvió una suscripción válida." };
  }

  const { error } = await supabase
    .from("pocket_push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        label: String(input.label ?? "").slice(0, 60) || null,
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    return {
      status: "error",
      error: "No se pudo guardar. ¿Corriste la migración 0003?",
    };
  }

  return { status: "saved" };
}

export async function deletePushSubscription(endpoint: string) {
  const { supabase, user } = await pocketSession();

  await supabase
    .from("pocket_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
}

/** Un aviso de prueba al dispositivo que lo pide, para ver que todo llega. */
export async function sendTestPush(): Promise<PushSaveState> {
  const { supabase, user } = await pocketSession();

  const { data } = await supabase
    .from("pocket_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", user.id);

  const subscriptions = (data ?? []) as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];

  if (subscriptions.length === 0) {
    return { status: "error", error: "Todavía no hay ningún dispositivo conectado." };
  }

  const result = await sendPush(subscriptions, {
    title: "My Pocket",
    body: "Probando: así se va a ver cuando entre tu salario.",
    url: "/hub/my-pocket",
    tag: "pocket-test",
  });

  if (result.sent === 0) {
    return {
      status: "error",
      error: result.errors[0] ?? "No se pudo entregar el aviso.",
    };
  }

  return { status: "saved" };
}

/* -------------------------------------------------------------------------- */
/* Panel de pruebas — solo para el administrador                               */
/* -------------------------------------------------------------------------- */

export type AdminPushKind = "reminder" | "salary";

/**
 * Dispara el aviso real contra los dispositivos de quien lo pide.
 *
 * El guardia va acá y no solo en la interfaz: una Server Action es alcanzable
 * por POST directo, así que esconder el botón no protege nada. Y solo puede
 * mandarse avisos a sí mismo — no hay forma de apuntarle a otra persona.
 */
export async function sendAdminPush(kind: AdminPushKind): Promise<PushSaveState> {
  const { supabase, user, profile } = await pocketSession();

  if (!isAdmin(user.email)) {
    return { status: "error", error: "No disponible." };
  }

  const { data } = await supabase
    .from("pocket_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", user.id);

  const subscriptions = (data ?? []) as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];

  if (subscriptions.length === 0) {
    return { status: "error", error: "Activá los avisos en este dispositivo primero." };
  }

  const currency = profile?.currency ?? "HNL";

  let payload;

  if (kind === "salary") {
    payload = salaryPayload([
      { label: "Quincena", amountBase: 14550, baseCurrency: currency },
    ]);
  } else {
    // El recordatorio se arma con tus gastos reales de hoy, así ves el texto
    // exacto que te va a llegar a la 1 y a las 7, no uno inventado.
    const today = isoDate(new Date());
    const { data: spent } = await supabase
      .from("pocket_transactions")
      .select("amount_base")
      .eq("user_id", user.id)
      .eq("kind", "expense")
      .eq("occurred_at", today);

    const rows = spent ?? [];
    payload = reminderPayload({
      count: rows.length,
      total: rows.reduce((sum, row) => sum + (Number(row.amount_base) || 0), 0),
      currency,
    });
  }

  const result = await sendPush(subscriptions, payload);

  if (result.sent === 0) {
    return {
      status: "error",
      error: result.errors[0] ?? "No se pudo entregar el aviso.",
    };
  }

  return { status: "saved" };
}
