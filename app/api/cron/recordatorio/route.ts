import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron, todayIn, TIMEZONE } from "@/lib/cron";
import { duePayload, reminderPayload, type DueLine } from "@/lib/notifications";
import {
  dropSubscriptions,
  sendPush,
  type PushSubscriptionRow,
} from "@/lib/push";
import { occursOn, type Recurrence } from "@/lib/pocket";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recordatorio para registrar gastos — pensado para dos pings diarios
 * (13:00 y 19:00) desde cron-job.org.
 *
 * Este mismo ping es el que avisa los gastos contemplados que vencen hoy: no
 * hace falta un cron nuevo porque ya pasa dos veces al día por cada persona,
 * y un vencimiento que no se registró a las 13:00 merece justamente que se lo
 * repitan a las 19:00. Cuando hay algo que vence, el aviso concreto reemplaza
 * al genérico: nombrar la renta vale más que preguntar "¿en qué se te fue?".
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
  const [{ data: profiles }, { data: spent }, duesByUser] = await Promise.all([
    supabase.from("work_profiles").select("user_id,currency").in("user_id", userIds),
    supabase
      .from("pocket_transactions")
      .select("user_id,amount_base")
      .eq("occurred_at", today)
      .eq("kind", "expense")
      .in("user_id", userIds),
    loadDuesToday(supabase, userIds, today),
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
    const dues = duesByUser.get(userId) ?? [];
    const payload =
      dues.length > 0 ? duePayload(dues) : reminderPayload({ ...stat, currency });

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

/* -------------------------------------------------------------------------- */

/**
 * Los gastos contemplados que vencen hoy y que nadie registró todavía.
 *
 * Quién vence hoy lo decide `occursOn`, la misma función que dibuja la agenda
 * en pantalla: el aviso y lo que la persona ve al abrir la app salen de la
 * misma regla. Lo ya registrado hoy se descuenta — avisar de algo que la
 * persona acaba de pagar es la forma más rápida de que apague las
 * notificaciones.
 */
async function loadDuesToday(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[],
  today: string
): Promise<Map<string, DueLine[]>> {
  const byUser = new Map<string, DueLine[]>();

  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  const COLUMNS = "id,user_id,name,amount,currency";

  // Sin la migración 0006 no hay reglas ni rangos: se lee lo de siempre y
  // todo se comporta como un gasto mensual de monto exacto.
  const full = await supabase
    .from("pocket_fixed_expenses")
    .select(`${COLUMNS},amount_max,day_of_month,freq,weekday,week_ordinal`)
    .eq("active", true)
    .in("user_id", userIds);

  const { data } = full.error
    ? await supabase
        .from("pocket_fixed_expenses")
        .select(`${COLUMNS},day_of_month`)
        .eq("active", true)
        .in("user_id", userIds)
    : full;

  const due = (data ?? [])
    .map((row) => ({
      ...row,
      freq: (row as { freq?: string }).freq ?? "monthly_day",
      weekday: (row as { weekday?: number | null }).weekday ?? null,
      week_ordinal: (row as { week_ordinal?: number | null }).week_ordinal ?? null,
    }))
    .filter((row) => occursOn(row as unknown as Recurrence, date));

  if (due.length === 0) return byUser;

  const { data: registered } = await supabase
    .from("pocket_transactions")
    .select("fixed_expense_id")
    .eq("occurred_at", today)
    .in(
      "fixed_expense_id",
      due.map((row) => String(row.id))
    );

  const already = new Set(
    (registered ?? []).map((row) => String(row.fixed_expense_id))
  );

  for (const row of due) {
    const id = String(row.id);
    if (already.has(id)) continue;

    const userId = String(row.user_id);
    const lines = byUser.get(userId) ?? [];
    const max = (row as { amount_max?: number | null }).amount_max;

    lines.push({
      id,
      name: String(row.name),
      amount: Number(row.amount),
      amountMax: max == null ? null : Number(max),
      currency: String(row.currency),
    });
    byUser.set(userId, lines);
  }

  return byUser;
}
