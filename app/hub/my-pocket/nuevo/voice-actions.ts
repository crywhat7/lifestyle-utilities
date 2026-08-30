"use server";

import { readSpokenExpense } from "@/lib/ai/voice";
import { CURRENCY_CODES } from "@/lib/money";
import { isoDate, slugify } from "@/lib/pocket";
import { globalCategories } from "../categories";
import { loadCategories, pocketSession } from "../data";

/** Siete segundos de opus no llegan a 200 KB; el resto es otra cosa. */
const MAX_BYTES = 2_000_000;
const MIME_PREFIX = "audio/";

export type VoiceState =
  | { status: "idle" }
  | {
      status: "ready";
      /** Lo que se entendió, tal cual: es la explicación de todo lo demás. */
      transcript: string;
      description: string;
      amount: number;
      currency: string;
      occurred_at: string;
      categoryId: string | null;
      categoryName: string;
      iconKey: string;
    }
  | { status: "error"; error: string; transcript?: string };

/**
 * Escucha el dictado y devuelve el egreso propuesto — sin guardar nada.
 *
 * Lo que se guarda pasa después por `createTransaction`, la misma acción que
 * usa el formulario escrito: la voz es una forma de llenar el formulario, no
 * un camino paralelo hacia la base con sus propias reglas.
 *
 * El audio se lee y se descarta. No se guarda en ningún lado.
 */
export async function readVoiceExpense(
  _prev: VoiceState,
  formData: FormData
): Promise<VoiceState> {
  const { supabase, profile } = await pocketSession();

  if (!profile) {
    return { status: "error", error: "Configurá primero tu ingreso." };
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return { status: "error", error: "No se grabó nada. Probá de nuevo." };
  }
  if (!audio.type.startsWith(MIME_PREFIX)) {
    return { status: "error", error: "Eso no es audio." };
  }
  if (audio.size > MAX_BYTES) {
    return { status: "error", error: "El audio pesa demasiado." };
  }

  const today = isoDate(new Date());
  const categories = await loadCategories(supabase);
  const globals = globalCategories(categories, "expense");

  const result = await readSpokenExpense({
    audio,
    existing: globals.map((category) => category.name),
    baseCurrency: profile.currency,
    today,
  });

  if (!result.ok) {
    if (result.kind === "no_key") {
      return { status: "error", error: "El dictado por voz no está configurado." };
    }
    if (result.kind === "unclear") {
      return {
        status: "error",
        error: "Se escuchó, pero ahí no hay un gasto. Decí el monto y en qué.",
        transcript: result.transcript,
      };
    }
    return {
      status: "error",
      error: "No se escuchó nada. Acercá el teléfono y hablá normal.",
    };
  }

  const { draft, transcript } = result;
  const slug = slugify(draft.category);
  const match = slug
    ? (globals.find((category) => category.slug === slug) ?? null)
    : null;

  const currency = CURRENCY_CODES.includes(
    draft.currency as (typeof CURRENCY_CODES)[number]
  )
    ? draft.currency
    : profile.currency;

  return {
    status: "ready",
    transcript,
    description: draft.description,
    amount: Math.round(draft.amount * 100) / 100,
    currency,
    // Una fecha dictada nunca puede caer adelante de hoy.
    occurred_at:
      draft.date && draft.date <= today ? draft.date : today,
    categoryId: match?.id ?? null,
    categoryName: match?.name ?? draft.category,
    iconKey: match?.icon_key ?? draft.iconKey,
  };
}
