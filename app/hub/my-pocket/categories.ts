import "server-only";
import { slugify, type PocketCategory } from "@/lib/pocket";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Devuelve el id de una categoría global por nombre, creándola si hace falta.
 *
 * El vocabulario compartido crece con el uso de todos: cuando la IA inventa
 * una categoría, queda global. Las personales nunca entran acá — son privadas
 * y la IA no debe empujar a nadie hacia ellas.
 */
export async function ensureGlobalCategory(
  supabase: Supabase,
  kind: "income" | "expense",
  name: string,
  iconKey: string,
  globals: PocketCategory[]
): Promise<string | null> {
  const slug = slugify(name);
  if (!slug) return null;

  const match = globals.find((category) => category.slug === slug);
  if (match) return match.id;

  const { data: created } = await supabase
    .from("pocket_categories")
    .insert({
      user_id: null,
      name: name.trim().slice(0, 40),
      slug,
      icon_key: iconKey,
      kind,
      is_ai: true,
    })
    .select("id")
    .single();

  if (created?.id) return created.id as string;

  // Otra sesión la creó primero: la constraint única la rechazó, no la app.
  const { data: existing } = await supabase
    .from("pocket_categories")
    .select("id")
    .is("user_id", null)
    .eq("slug", slug)
    .eq("kind", kind)
    .maybeSingle();

  return (existing?.id as string | undefined) ?? null;
}

/** Las que la IA puede ver y reutilizar: globales del tipo que toca. */
export function globalCategories(
  categories: PocketCategory[],
  kind: "income" | "expense"
) {
  return categories.filter(
    (category) =>
      category.user_id === null &&
      (category.kind === kind || category.kind === "both")
  );
}
