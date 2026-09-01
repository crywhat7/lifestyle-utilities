import { redirect } from "next/navigation";
import {
  loadCategories,
  loadFixedExpenses,
  loadPaySchedules,
  loadPocketProfile,
  pocketClient,
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
  const { supabase, user } = await pocketClient();

  // Todo junto: el perfil no le da datos a ninguna de las otras consultas.
  const [{ profile }, categories, fixedExpenses, paySchedules] =
    await Promise.all([
      loadPocketProfile(supabase, user.id),
      loadCategories(supabase),
      loadFixedExpenses(supabase, user.id),
      loadPaySchedules(supabase, user.id),
    ]);

  if (!profile) redirect("/hub/my-pocket");

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
