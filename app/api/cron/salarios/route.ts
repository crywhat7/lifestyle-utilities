import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron, todayIn, TIMEZONE } from "@/lib/cron";
import { salaryEmail, type SalaryLine } from "@/lib/emails/salary";
import { convert } from "@/lib/fx";
import { salaryPayload } from "@/lib/notifications";
import { sendMail } from "@/lib/mail";
import { occursOn, type Recurrence } from "@/lib/pocket";
import { dropSubscriptions, sendPush, type PushSubscriptionRow } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registro automático de salarios — pensado para un ping diario de cron-job.org.
 *
 * Busca las fechas de pago que caen hoy, las materializa como ingreso y avisa
 * por correo. Es idempotente por diseño: la constraint única
 * (pay_schedule_id, occurred_at) es la que garantiza que un pago no se cobre
 * dos veces, así que correrlo diez veces el mismo día no infla ningún balance.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Schedule = Recurrence & {
  id: string;
  user_id: string;
  label: string;
  amount: number;
  currency: string;
};

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

/* -------------------------------------------------------------------------- */

async function run(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();

  // `?date=` recupera un día que el cron se haya saltado; `?dry=1` calcula
  // todo y no escribe ni envía nada. Las dos viven detrás del mismo secreto.
  const override = request.nextUrl.searchParams.get("date");
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    return NextResponse.json(
      { error: "El parámetro date va en formato YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const today = override ?? todayIn(TIMEZONE);
  const [year, month, day] = today.split("-").map(Number);
  // Fecha local del bolsillo, no del servidor: `new Date("2026-08-26")` sería
  // medianoche UTC y en América eso todavía es el día anterior.
  const date = new Date(year, month - 1, day);

  const COLUMNS = "id,user_id,label,day_of_month,amount,currency";

  // Las columnas de la regla llegaron con la migración 0006; sin ellas, todo
  // sigue siendo mensual por día, que es como se comportaba antes.
  const full = await supabase
    .from("pocket_pay_schedules")
    .select(`${COLUMNS},freq,weekday,week_ordinal`)
    .eq("active", true);

  const { data: matched, error: matchError } = full.error
    ? await supabase.from("pocket_pay_schedules").select(COLUMNS).eq("active", true)
    : full;

  if (matchError) {
    return NextResponse.json(
      { error: "No se pudieron leer las fechas de pago.", detail: matchError.message },
      { status: 500 }
    );
  }

  // El filtro vive en `occursOn`, no en la consulta: es la misma función que
  // usa la pantalla para decir "cae hoy", así que el cron y la agenda nunca
  // pueden discrepar sobre qué día toca.
  const schedules = (matched ?? [])
    .map((row) => ({
      ...row,
      freq: (row as { freq?: string }).freq ?? "monthly_day",
      weekday: (row as { weekday?: number | null }).weekday ?? null,
      week_ordinal: (row as { week_ordinal?: number | null }).week_ordinal ?? null,
      amount: Number(row.amount),
    }))
    .filter((schedule) => occursOn(schedule as Schedule, date)) as Schedule[];

  if (schedules.length === 0) {
    return NextResponse.json({
      ok: true,
      date: today,
      timezone: TIMEZONE,
      matched: 0,
      created: 0,
      skipped: 0,
      emailed: 0,
    });
  }

  // Lo ya registrado hoy no se vuelve a tocar ni vuelve a generar correo.
  const { data: existing } = await supabase
    .from("pocket_transactions")
    .select("pay_schedule_id")
    .eq("occurred_at", today)
    .in(
      "pay_schedule_id",
      schedules.map((schedule) => schedule.id)
    );

  const already = new Set(
    (existing ?? []).map((row) => String(row.pay_schedule_id))
  );
  const pending = schedules.filter((schedule) => !already.has(schedule.id));

  const errors: string[] = [];
  const created: (SalaryLine & { userId: string })[] = [];

  if (pending.length > 0) {
    const userIds = [...new Set(pending.map((schedule) => schedule.user_id))];

    const [{ data: profiles }, { data: categories }] = await Promise.all([
      supabase
        .from("work_profiles")
        .select("user_id,currency")
        .in("user_id", userIds),
      supabase
        .from("pocket_categories")
        .select("id")
        .is("user_id", null)
        .eq("slug", "salario")
        .eq("kind", "income")
        .limit(1),
    ]);

    const baseByUser = new Map(
      (profiles ?? []).map((row) => [String(row.user_id), String(row.currency)])
    );
    const salaryCategoryId = (categories ?? [])[0]?.id
      ? String((categories ?? [])[0].id)
      : null;

    for (const schedule of pending) {
      // Sin perfil no hay moneda base: ese usuario todavía no terminó el alta.
      const baseCurrency = baseByUser.get(schedule.user_id);
      if (!baseCurrency) {
        errors.push(`${schedule.id}: el usuario no tiene moneda base.`);
        continue;
      }

      const converted = await convert(
        schedule.amount,
        schedule.currency,
        baseCurrency
      );
      if (!converted) {
        errors.push(
          `${schedule.id}: no se pudo convertir ${schedule.currency} a ${baseCurrency}.`
        );
        continue;
      }

      const amountBase = Math.round(converted.amount * 100) / 100;

      if (dry) {
        created.push({
          userId: schedule.user_id,
          label: schedule.label,
          amount: schedule.amount,
          currency: schedule.currency,
          amountBase,
          baseCurrency,
        });
        continue;
      }

      const { error } = await supabase.from("pocket_transactions").insert({
        user_id: schedule.user_id,
        kind: "income",
        description: schedule.label,
        amount: schedule.amount,
        currency: schedule.currency,
        amount_base: amountBase,
        base_currency: baseCurrency,
        fx_rate: converted.rate,
        category_id: salaryCategoryId,
        pay_schedule_id: schedule.id,
        source: "salary",
        occurred_at: today,
      });

      if (error) {
        // 23505 = otra corrida ganó la carrera. No es un fallo: es la regla.
        if (error.code !== "23505") {
          errors.push(`${schedule.id}: ${error.message}`);
        }
        continue;
      }

      created.push({
        userId: schedule.user_id,
        label: schedule.label,
        amount: schedule.amount,
        currency: schedule.currency,
        amountBase,
        baseCurrency,
      });
    }
  }

  const { emailed, pushed } = dry
    ? { emailed: 0, pushed: 0 }
    : await notify(supabase, created, errors);

  return NextResponse.json({
    ok: true,
    dry,
    date: today,
    timezone: TIMEZONE,
    matched: schedules.length,
    created: created.length,
    ...(dry ? { preview: created } : {}),
    skipped: schedules.length - pending.length,
    emailed,
    pushed,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Un aviso por persona, aunque le hayan caído dos pagos el mismo día: un
 * correo y un push a cada dispositivo conectado. Los dos caminos son
 * independientes — que falle uno no cancela el otro ni deshace el registro.
 */
async function notify(
  supabase: ReturnType<typeof createAdminClient>,
  created: (SalaryLine & { userId: string })[],
  errors: string[]
) {
  const byUser = new Map<string, SalaryLine[]>();

  for (const line of created) {
    const lines = byUser.get(line.userId) ?? [];
    lines.push(line);
    byUser.set(line.userId, lines);
  }

  let emailed = 0;
  let pushed = 0;

  for (const [userId, lines] of byUser) {
    pushed += await push(supabase, userId, lines, errors);

    const { data, error } = await supabase.auth.admin.getUserById(userId);
    const to = data?.user?.email;

    if (error || !to) {
      errors.push(`${userId}: no tiene correo al que avisarle.`);
      continue;
    }

    const balance = await currentBalance(supabase, userId);
    const { subject, html, text } = salaryEmail(
      lines,
      balance,
      lines[0].baseCurrency
    );

    const outcome = await sendMail({ to, subject, html, text });

    // El correo que no sale no deshace el registro: la plata ya entró.
    if (outcome.ok) emailed += 1;
    else errors.push(`${userId}: correo no enviado — ${outcome.error}`);
  }

  return { emailed, pushed };
}

/** El push llega a todos los dispositivos que esa persona haya conectado. */
async function push(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  lines: SalaryLine[],
  errors: string[]
) {
  const { data } = await supabase
    .from("pocket_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) return 0;

  const result = await sendPush(subscriptions, salaryPayload(lines));

  await dropSubscriptions(supabase, result.gone);
  errors.push(...result.errors);

  return result.sent;
}

async function currentBalance(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data } = await supabase
    .from("pocket_transactions")
    .select("kind,amount_base")
    .eq("user_id", userId)
    .limit(5000);

  let balance = 0;
  for (const row of data ?? []) {
    const amount = Number(row.amount_base) || 0;
    balance += row.kind === "income" ? amount : -amount;
  }
  return balance;
}

/* -------------------------------------------------------------------------- */
