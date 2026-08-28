import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { salaryEmail, type SalaryLine } from "@/lib/emails/salary";
import { convert } from "@/lib/fx";
import { sendMail } from "@/lib/mail";
import { daysInMonth } from "@/lib/pocket";
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

/** El día de pago es el del bolsillo de la persona, no el del servidor. */
const TIMEZONE = process.env.POCKET_TIMEZONE || "America/Tegucigalpa";

type Schedule = {
  id: string;
  user_id: string;
  label: string;
  day_of_month: number;
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
  if (!authorized(request)) {
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

  const today = override ?? ymd(new Date(), TIMEZONE);
  const [year, month, day] = today.split("-").map(Number);
  const lastDay = daysInMonth(year, month - 1);

  // El 31 en un mes de 30 se cobra el último día que sí existe.
  const query = supabase
    .from("pocket_pay_schedules")
    .select("id,user_id,label,day_of_month,amount,currency")
    .eq("active", true);

  const { data: matched, error: matchError } = await (day === lastDay
    ? query.gte("day_of_month", day)
    : query.eq("day_of_month", day));

  if (matchError) {
    return NextResponse.json(
      { error: "No se pudieron leer las fechas de pago.", detail: matchError.message },
      { status: 500 }
    );
  }

  const schedules = (matched ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  })) as Schedule[];

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

  const emailed = dry ? 0 : await notify(supabase, created, errors);

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
    ...(errors.length > 0 ? { errors } : {}),
  });
}

/* -------------------------------------------------------------------------- */

/** Un correo por persona, aunque le hayan caído dos pagos el mismo día. */
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

  for (const [userId, lines] of byUser) {
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

  return emailed;
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

/**
 * `Authorization: Bearer <CRON_SECRET>`, o `?secret=` para los programadores
 * que no dejan poner cabeceras. La comparación es de tiempo constante.
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = bearer || request.nextUrl.searchParams.get("secret") || "";

  return equals(provided, secret);
}

function equals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** YYYY-MM-DD en la zona del bolsillo, sin que UTC corra el día. */
function ymd(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
