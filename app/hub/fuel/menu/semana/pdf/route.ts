import { expandRecipes } from "@/lib/ai/fuel";
import { TIMEZONE } from "@/lib/cron";
import { formatKcal, plannedDishes, type Recipe } from "@/lib/fuel";
import { weekPlanPdf } from "@/lib/fuel-pdf";
import { fuelClient, loadProfile, loadWeekPlan } from "../../../data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// La primera exportación le pide las recetas a la IA: puede tardar.
export const maxDuration = 60;

const DAY = new Intl.DateTimeFormat("es-HN", { timeZone: TIMEZONE, day: "numeric", month: "long" });

/**
 * El PDF del menú de la semana.
 *
 * Las recetas detalladas se piden a la IA solo para los platos que todavía
 * no tienen una, y se guardan: la segunda exportación de la misma semana es
 * instantánea y no gasta cuota. Si la IA no contesta, el PDF sale igual con
 * la preparación corta del menú — mejor una receta breve que ningún papel.
 */
export async function GET() {
  const { supabase, user } = await fuelClient();
  const [plan, { profile }] = await Promise.all([
    loadWeekPlan(supabase, user.id),
    loadProfile(supabase, user.id),
  ]);

  if (plan.missing) {
    return Response.json({ error: "Falta correr la migración 0016 en Supabase." }, { status: 500 });
  }

  const dishes = plannedDishes(plan.slots);
  if (dishes.length === 0) {
    return Response.json({ error: "La semana está vacía: elegí al menos un plato." }, { status: 400 });
  }

  const recipes: Record<string, Recipe> = { ...plan.recipes };
  const pending = dishes.map((dish) => dish.item).filter((item) => !recipes[item.name]);

  if (pending.length > 0) {
    const answer = await expandRecipes(pending);
    if (answer.ok) {
      for (const recipe of answer.data) recipes[recipe.name] = recipe;
      await supabase.from("fuel_week_plans").update({ recipes }).eq("user_id", user.id);
    }
  }

  const firstName = (user.name ?? "").trim().split(/\s+/)[0];
  const subtitle = [
    firstName ? `Para ${firstName}` : null,
    `Armado el ${DAY.format(new Date())}`,
    profile?.target_kcal ? `Meta: ${formatKcal(profile.target_kcal)} kcal por día` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const bytes = await weekPlanPdf({
    slots: plan.slots,
    recipes,
    title: "Menú de la semana",
    subtitle,
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="menu-de-la-semana.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
