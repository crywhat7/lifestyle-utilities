import { redirect } from "next/navigation";
import {
  loadCategories,
  loadFixedExpenses,
  loadPaySchedules,
  pocketSession,
} from "../data";
import { EntryScreen } from "./entry-screen";

/**
 * Registrar es una pantalla propia, no una hoja encima del balance: así hay
 * un solo scroll y la cuadrícula de categorías puede respirar.
 */
export async function EntryRoute({
  kind,
  preselect = null,
}: {
  kind: "income" | "expense";
  /** Id de la plantilla (gasto contemplado o fecha de pago) que llega ya elegida. */
  preselect?: string | null;
}) {
  const { supabase, user, profile } = await pocketSession();

  if (!profile) redirect("/hub/my-pocket");

  const [categories, fixedExpenses, paySchedules] = await Promise.all([
    loadCategories(supabase),
    loadFixedExpenses(supabase, user.id),
    loadPaySchedules(supabase, user.id),
  ]);

  return (
    <EntryScreen
      kind={kind}
      categories={categories}
      fixedExpenses={fixedExpenses}
      paySchedules={paySchedules}
      baseCurrency={profile.currency}
      preselect={preselect}
    />
  );
}
