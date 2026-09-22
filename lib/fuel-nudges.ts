import "server-only";
import { dayStatus, dueCheckpoint, mealMacros, type Goal, type NudgeKind } from "@/lib/fuel";
import { fuelPayload } from "@/lib/notifications";
import { dropSubscriptions, sendPush, type PushSubscriptionRow } from "@/lib/push";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * El parte de calorías, colgado del mismo cron que los hábitos.
 *
 * No tiene ruta propia a propósito: el cron de los hábitos ya pasa por cada
 * persona varias veces por hora, y un segundo trabajo en cron-job.org sería
 * una cosa más que configurar y que se puede romper sola.
 *
 * Dos clases de aviso:
 *
 * · Los cuatro momentos del día (10:30, 14:30, 18:00, 20:30): cuánto llevás
 *   y cuánto te falta. Cada uno se manda una vez por día.
 * · El de pasarse: sale en la primera corrida después de cruzar la meta, a la
 *   hora que sea, y tampoco se repite.
 *
 * Si un momento y el de pasarse coinciden en la misma corrida, se manda uno
 * solo —el de pasarse— y se reclaman los dos: dos globos seguidos diciendo
 * casi lo mismo son la forma más rápida de que alguien apague los avisos.
 */

type Client = ReturnType<typeof createAdminClient>;

export type FuelRun = {
  users: number;
  pushed: number;
  nudges: { userId: string; kinds: NudgeKind[]; eaten: number; target: number }[];
  errors?: string[];
  error?: string;
};

export async function runFuelNudges({
  supabase,
  byUser,
  today,
  minutes,
  dry,
}: {
  supabase: Client;
  byUser: Map<string, PushSubscriptionRow[]>;
  today: string;
  minutes: number;
  dry: boolean;
}): Promise<FuelRun> {
  const empty: FuelRun = { users: 0, pushed: 0, nudges: [] };
  if (byUser.size === 0) return empty;

  const checkpoint = dueCheckpoint(minutes);

  const { data: profiles, error } = await supabase
    .from("fuel_profiles")
    .select("user_id,target_kcal,goal,remind")
    .eq("remind", true)
    .not("target_kcal", "is", null)
    .in("user_id", [...byUser.keys()]);

  // Sin la migración 0015 el módulo simplemente no existe todavía: se avisa
  // en la respuesta, pero los hábitos siguen su curso.
  if (error) return { ...empty, error: `fuel_profiles: ${error.message}. ¿Corriste la 0015?` };
  if (!profiles || profiles.length === 0) return empty;

  const ids = profiles.map((row) => String(row.user_id));

  const [{ data: meals }, { data: sent }] = await Promise.all([
    supabase
      .from("fuel_meals")
      .select("user_id,kcal,protein_g,carbs_g,fat_g,portion")
      .eq("eaten_on", today)
      .in("user_id", ids),
    supabase.from("fuel_nudges").select("user_id,kind").eq("sent_on", today).in("user_id", ids),
  ]);

  const eatenBy = new Map<string, { kcal: number; count: number }>();
  for (const row of meals ?? []) {
    const id = String(row.user_id);
    const stat = eatenBy.get(id) ?? { kcal: 0, count: 0 };
    stat.kcal += mealMacros({
      kcal: Number(row.kcal),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
      portion: Number(row.portion),
    }).kcal;
    stat.count += 1;
    eatenBy.set(id, stat);
  }

  const already = new Set((sent ?? []).map((row) => `${row.user_id}:${row.kind}`));

  type Plan = { userId: string; kinds: NudgeKind[]; eaten: number; count: number; target: number; goal: Goal };
  const plans: Plan[] = [];

  for (const profile of profiles) {
    const userId = String(profile.user_id);
    const target = Number(profile.target_kcal);
    const goal = profile.goal as Goal;
    const { kcal: eaten, count } = eatenBy.get(userId) ?? { kcal: 0, count: 0 };

    const kinds: NudgeKind[] = [];
    if (dayStatus(eaten, target).tone === "over" && !already.has(`${userId}:over`)) {
      kinds.push("over");
    }
    if (checkpoint && !already.has(`${userId}:${checkpoint}`)) kinds.push(checkpoint);

    if (kinds.length > 0) plans.push({ userId, kinds, eaten, count, target, goal });
  }

  const preview = plans.map(({ userId, kinds, eaten, target }) => ({ userId, kinds, eaten, target }));
  if (plans.length === 0 || dry) return { users: profiles.length, pushed: 0, nudges: preview };

  /*
    El candado: solo lo que esta corrida insertó de verdad vuelve en el
    `.select()`, así que dos corridas superpuestas no avisan dos veces.
  */
  const { data: claimed, error: claimError } = await supabase
    .from("fuel_nudges")
    .upsert(
      plans.flatMap(({ userId, kinds }) =>
        kinds.map((kind) => ({ user_id: userId, sent_on: today, kind }))
      ),
      { onConflict: "user_id,sent_on,kind", ignoreDuplicates: true }
    )
    .select("user_id,kind");

  if (claimError) {
    return { users: profiles.length, pushed: 0, nudges: [], error: `fuel_nudges: ${claimError.message}` };
  }

  const fresh = new Set((claimed ?? []).map((row) => `${row.user_id}:${row.kind}`));
  const errors: string[] = [];
  let pushed = 0;
  const delivered: FuelRun["nudges"] = [];

  for (const plan of plans) {
    const kinds = plan.kinds.filter((kind) => fresh.has(`${plan.userId}:${kind}`));
    if (kinds.length === 0) continue;

    const subscriptions = byUser.get(plan.userId);
    if (!subscriptions?.length) continue;

    const result = await sendPush(
      subscriptions,
      fuelPayload({
        // El de pasarse gana: es la noticia; el momento del día solo repite.
        kind: kinds.includes("over") ? "over" : kinds[0],
        eaten: plan.eaten,
        target: plan.target,
        goal: plan.goal,
        meals: plan.count,
      })
    );

    await dropSubscriptions(supabase, result.gone);
    errors.push(...result.errors);
    pushed += result.sent;
    delivered.push({ userId: plan.userId, kinds, eaten: plan.eaten, target: plan.target });
  }

  return {
    users: profiles.length,
    pushed,
    nudges: delivered,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
