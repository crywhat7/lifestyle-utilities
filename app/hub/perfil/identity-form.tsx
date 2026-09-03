"use client";

import { useActionState, useState } from "react";
import { Check } from "@/components/icons";
import {
  initialsOf,
  NAME_MAX,
  normalizeUsername,
  suggestUsername,
  usernameIssue,
  USERNAME_MAX,
  type UserProfile,
} from "@/lib/profile";
import { saveIdentity, type IdentityState } from "./actions";

const INITIAL: IdentityState = { status: "idle" };

/**
 * Quién sos, en una sola placa.
 *
 * El disco de iniciales cambia mientras se escribe el nombre y el apodo se
 * normaliza tecla a tecla: lo que se ve en el campo es exactamente lo que va a
 * quedar guardado, así nadie descubre después que su "María.José" se convirtió
 * en otra cosa.
 */
export function IdentityForm({
  profile,
  email,
}: {
  profile: UserProfile;
  email: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveIdentity, INITIAL);

  const [name, setName] = useState(profile.name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");

  const initials = initialsOf(name) || "LU";
  const placeholder = suggestUsername(profile.name ?? email) || "tu.apodo";

  // Mientras se escribe manda lo que dice el campo; una vez que el servidor
  // habló —"ya está tomado"— manda el servidor, hasta el siguiente cambio.
  const localIssue = usernameIssue(username);
  const serverIssue =
    state.status === "error" && state.field === "username" ? state.error : null;

  return (
    <form action={formAction} className="plate flex flex-col gap-5 p-5">
      <div className="flex items-center gap-4">
        <span className="key flex size-16 shrink-0 items-center justify-center rounded-full text-[1.125rem] font-semibold text-[var(--text-2)]">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <p className="eyebrow">Tu identidad</p>
          <h2 className="display mt-2 text-[1.625rem]">Nombre y apodo</h2>
        </span>
      </div>

      <div>
        <label className="field-label" htmlFor="profile-name">
          Cómo te llamás
        </label>
        <input
          id="profile-name"
          name="name"
          type="text"
          required
          maxLength={NAME_MAX}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tu nombre"
          className="field"
        />
        <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          Es el saludo del hub: ahí solo aparece la primera palabra.
        </p>
        {state.status === "error" && state.field === "name" ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-[var(--danger)]">
            {state.error}
          </p>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="profile-username">
          Nombre de usuario
        </label>
        {/* La arroba vive afuera del campo: se ve siempre y no hay que
            escribirla —ni borrarla— para que el valor sea válido. */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[1rem] text-[var(--text-3)]"
          >
            @
          </span>
          <input
            id="profile-username"
            name="username"
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            maxLength={USERNAME_MAX}
            value={username}
            onChange={(event) =>
              setUsername(normalizeUsername(event.target.value))
            }
            placeholder={placeholder}
            className="field pl-9"
          />
        </div>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          Minúsculas, números, punto y guion bajo. Dejalo vacío si no querés
          uno.
        </p>
        {localIssue ?? serverIssue ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-[var(--danger)]">
            {localIssue ?? serverIssue}
          </p>
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="profile-email">
          Correo para los avisos
        </label>
        <input
          id="profile-email"
          name="notification_email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          defaultValue={profile.notification_email ?? email ?? ""}
          placeholder={email ?? "vos@correo.com"}
          className="field"
        />
        <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          A dónde llegan los recordatorios y el aviso de quincena. No cambia el
          correo con el que entrás.
        </p>
        {state.status === "error" && state.field === "notification_email" ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-[var(--danger)]">
            {state.error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || Boolean(localIssue)}
        className="key key-accent h-14 w-full text-[1rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>

      {state.status === "saved" ? (
        <p className="flex items-center justify-center gap-2 text-[0.8125rem] text-[var(--text-2)]">
          <Check className="size-3.5 text-[var(--accent-ink)]" />
          Guardado
        </p>
      ) : null}

      {state.status === "error" && !state.field ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
