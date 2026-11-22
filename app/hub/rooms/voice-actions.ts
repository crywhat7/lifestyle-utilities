"use server";

import { transcribeSpeech } from "@/lib/ai/voice";
import { roomsClient } from "./data";

/** Seis segundos de opus no llegan a 200 KB; el resto es otra cosa. */
const MAX_BYTES = 2_000_000;

export type HeardState =
  | { status: "idle" }
  | { status: "heard"; text: string }
  | { status: "error"; error: string };

/**
 * Lo que se dijo, pasado a texto. Nada más.
 *
 * Esto no interpreta: no deduce categoría, no parte el nombre en marca y
 * modelo, no corrige lo que oyó. Devuelve la frase y el campo del nombre la
 * recibe como si se hubiera escrito a mano —se puede borrar una letra antes
 * de guardar—, porque un dictado que se guarda solo es un dictado que nadie
 * revisa y en un inventario el nombre es la única forma de volver a encontrar
 * la cosa.
 *
 * El audio se lee y se descarta. No se guarda en ningún lado.
 */
export async function readSpokenName(
  _prev: HeardState,
  form: FormData
): Promise<HeardState> {
  /* La sesión se pide igual que en cualquier acción del módulo: esto gasta
     una llamada a un servicio de paga y no puede quedar abierto a cualquiera
     que conozca la dirección. */
  await roomsClient();

  const audio = form.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return { status: "error", error: "No se grabó nada. Probá de nuevo." };
  }
  if (!audio.type.startsWith("audio/")) {
    return { status: "error", error: "Eso no es audio." };
  }
  if (audio.size > MAX_BYTES) {
    return { status: "error", error: "El audio pesa demasiado." };
  }

  /* Sin clave no hay transcripción, y el error de abajo diría "no se
     entendió" por algo que no tiene nada que ver con lo que se dijo. */
  if (!process.env.GROQ_API_KEY) {
    return { status: "error", error: "El dictado por voz no está configurado." };
  }

  const heard = await transcribeSpeech(audio);

  if (!heard) {
    return {
      status: "error",
      error: "No se entendió. Acercá el teléfono y decilo otra vez.",
    };
  }

  /* El nombre de una cosa no termina en punto. Whisper transcribe frases y
     devuelve puntuación de frase; acá el resultado va a un campo de ochenta
     caracteres que después se lee en una lista. */
  const text = heard
    .replace(/\s+/g, " ")
    .replace(/[.,;:!¡?¿]+$/u, "")
    .trim()
    .slice(0, 80);

  if (!text) {
    return {
      status: "error",
      error: "No se entendió. Acercá el teléfono y decilo otra vez.",
    };
  }

  return { status: "heard", text: text.charAt(0).toUpperCase() + text.slice(1) };
}
