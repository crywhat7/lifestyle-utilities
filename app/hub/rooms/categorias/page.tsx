import type { Metadata } from "next";
import { ROOMS_PATH, loadIndex, loadOwnCategories, roomsClient } from "../data";
import { FormShell } from "../form-shell";
import { Catalog } from "./catalog";

export const metadata: Metadata = {
  title: "Mis categorías",
  description: "Las categorías que te hiciste vos, además de las de fábrica.",
};

/**
 * Las categorías propias.
 *
 * El conteo sale del índice que ya existe y no de una consulta con `group
 * by`: el inventario entero viene en cinco columnas por fila y contarlo acá
 * cuesta un recorrido de memoria. Una consulta más a Supabase para saber
 * cuántos cables hay sería pagar un viaje de red por un dato que ya está en
 * la mano.
 */
export default async function CategoriesPage() {
  const { supabase, user } = await roomsClient();

  const [own, index] = await Promise.all([
    loadOwnCategories(supabase, user.id),
    loadIndex(supabase, user.id),
  ]);

  const counts: Record<string, number> = {};
  for (const row of index) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }

  return (
    <FormShell
      back={ROOMS_PATH}
      backLabel="Cuartos"
      eyebrow="Tus categorías"
      title="Lo que tu casa tiene de propio"
    >
      <Catalog own={own} counts={counts} />
    </FormShell>
  );
}
