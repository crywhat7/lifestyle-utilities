import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadCategories, pocketSession } from "../../data";
import { ScanScreen } from "../scan-screen";

/**
 * Leer una captura es lo más lento que hace la app: la IA tarda entre tres
 * segundos y medio minuto según cómo ande el proveedor, y el reintento vive
 * dentro de la misma petición. El techo de la plataforma tiene que dar para
 * eso, o la persona ve un error donde solo había paciencia.
 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Leer captura · My Pocket",
  description: "Adjuntá los movimientos del banco y registrálos de una.",
};

export default async function ScanExpensesPage() {
  const { supabase, profile } = await pocketSession();

  if (!profile) redirect("/hub/my-pocket");

  const categories = await loadCategories(supabase);

  return (
    <ScanScreen categories={categories} baseCurrency={profile.currency} />
  );
}
