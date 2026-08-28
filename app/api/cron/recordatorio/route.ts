import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron, todayIn, TIMEZONE } from "@/lib/cron";
import { reminderPayload } from "@/lib/notifications";
import {
  dropSubscriptions,
  sendPush,
  type PushSubscriptionRow,
} from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recordatorio para registrar gastos — pensado para dos pings diarios
 * (13:00 y 19:00) desde cron-job.org.
 *
 * Solo manda push: un correo dos veces al día por algo que no pasó sería
 * spam, y el aviso pierde el sentido si se ignora. A quien no tenga ningún
 * dispositivo conectado, no le llega nada.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const supabase = createAdminClient();
  const today = todayIn(TIMEZONE);

  const { data: rows, error } = await supabase
    .from("pocket_push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron leer las suscripciones.", detail: error.message },
      { status: 500 }
    );
  }

  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const row of rows ?? []) {
    const userId = String(row.user_id);
    const list = byUser.get(userId) ?? [];
    list.push(row as PushSubscriptionRow);
    byUser.set(userId, list);
  }

  if (byUser.size === 0) {
    return NextResponse.json({
      ok: true,
      dry,
      date: today,
      timezone: TIMEZONE,
      users: 0,
      pushed: 0,
    });
  }

  const userIds = [...byUser.keys()];

  // Una sola pasada por los gastos del día: el aviso cambia según lo que ya
  // se registró, así que hay que saberlo antes de armar el texto.
  const [{ data: profiles }, { data: spent }] = await Promise.all([
    supabase.from("work_profiles").select("user_id,currency").in("user_id", userIds),
    supabase
      .from("pocket_transactions")
      .select("user_id,amount_base")
      .eq("occurred_at", today)
      .eq("kind", "expense")
      .in("user_id", userIds),
  ]);

  const currencyByUser = new Map(
    (profiles ?? []).map((row) => [String(row.user_id), String(row.currency)])
  );

  const statsByUser = new Map<string, { count: number; total: number }>();
  for (const row of spent ?? []) {
    const userId = String(row.user_id);
    const stat = statsByUser.get(userId) ?? { count: 0, total: 0 };
    stat.count += 1;
    stat.total += Number(row.amount_base) || 0;
    statsByUser.set(userId, stat);
  }

  const errors: string[] = [];
  let pushed = 0;
  const preview: unknown[] = [];

  for (const [userId, subscriptions] of byUser) {
    const currency = currencyByUser.get(userId);
    // Sin perfil no hay moneda con la que escribir el monto: todavía no
    // terminó el alta, así que no tiene sentido recordarle nada.
    if (!currency) continue;

    const stat = statsByUser.get(userId) ?? { count: 0, total: 0 };
    const payload = reminderPayload({ ...stat, currency });

    if (dry) {
      preview.push({ userId, devices: subscriptions.length, payload });
      continue;
    }

    const result = await sendPush(subscriptions, payload);
    await dropSubscriptions(supabase, result.gone);
    errors.push(...result.errors);
    pushed += result.sent;
  }

  return NextResponse.json({
    ok: true,
    dry,
    date: today,
    timezone: TIMEZONE,
    users: byUser.size,
    pushed,
    ...(dry ? { preview } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  });
}
