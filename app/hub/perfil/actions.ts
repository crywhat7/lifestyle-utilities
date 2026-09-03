"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
  NAME_MAX,
  normalizeUsername,
  usernameIssue,
  USERNAME_MAX,
} from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export type IdentityState = {
  status: "idle" | "saved" | "error";
  error?: string;
  /** Qué campo señalar, para que el error no quede flotando arriba de todo. */
  field?: "name" | "username" | "notification_email";
};

/** Un correo suficientemente correo: el resto lo dice el servidor de correo. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Guarda nombre, apodo y correo de avisos de una sola vez.
 *
 * Los tres viven en la misma fila, así que van en el mismo submit: partirlos
 * en tres formularios haría que la pantalla tuviera tres botones "Guardar" y
 * ningún estado claro de qué quedó puesto.
 */
export async function saveIdentity(
  _prev: IdentityState,
  formData: FormData
): Promise<IdentityState> {
  const user = await currentUser();
  if (!user) redirect("/");

  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX);

  if (name.length < 2) {
    return {
      status: "error",
      field: "name",
      error: "Escribí tu nombre, aunque sea corto.",
    };
  }

  // El apodo se vuelve a normalizar acá: el navegador ya lo hizo mientras se
  // escribía, pero una Server Action es alcanzable por POST directo.
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const issue = usernameIssue(username);

  if (issue) return { status: "error", field: "username", error: issue };

  const notificationEmail =
    String(formData.get("notification_email") ?? "")
      .trim()
      .slice(0, 254) || null;

  if (notificationEmail && !EMAIL.test(notificationEmail)) {
    return {
      status: "error",
      field: "notification_email",
      error: "Ese correo no se ve bien.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users_profiles")
    .update({
      name,
      username: username || null,
      notification_email: notificationEmail,
    })
    .eq("user_id", user.id);

  if (error) {
    // Índice único de la 0012: el apodo ya es de otra persona.
    if (error.code === "23505") {
      return {
        status: "error",
        field: "username",
        error: `@${username} ya está tomado. Probá otro.`,
      };
    }

    // La columna no existe todavía: la migración no se corrió.
    if (error.code === "42703" || /username/i.test(error.message)) {
      return {
        status: "error",
        field: "username",
        error: "Falta correr la migración 0012 en Supabase.",
      };
    }

    // El check de formato, por si algo se coló sin pasar por la validación.
    if (error.code === "23514") {
      return {
        status: "error",
        field: "username",
        error: `Solo minúsculas, números, punto y guion bajo (hasta ${USERNAME_MAX}).`,
      };
    }

    return { status: "error", error: "No se pudo guardar. Probá de nuevo." };
  }

  // El saludo del hub sale de esta misma fila: si no se revalida, la pantalla
  // anterior sigue mostrando el nombre viejo al volver.
  revalidatePath("/hub");
  revalidatePath("/hub/perfil");

  return { status: "saved" };
}
