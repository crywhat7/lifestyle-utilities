import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadCategories, pocketSession } from "../../data";
import { VoiceScreen } from "../voice-screen";

export const metadata: Metadata = {
  title: "Dictar egreso · My Pocket",
  description: "Siete segundos de voz y el gasto queda registrado.",
};

/** Transcribir y entender viven en la misma petición; 60s dan de sobra. */
export const maxDuration = 60;

export default async function DictateExpensePage() {
  const { supabase, profile } = await pocketSession();

  if (!profile) redirect("/hub/my-pocket");

  const categories = await loadCategories(supabase);

  return <VoiceScreen categories={categories} baseCurrency={profile.currency} />;
}
