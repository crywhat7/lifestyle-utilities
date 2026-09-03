import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack, Chevron, Power, Slate, Wallet } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { ThemeSwitch } from "@/components/theme-switch";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { initialsOf, resolveName, type UserProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
// El interruptor de avisos ya existe y escribe en la tabla que comparten
// todas las herramientas: traerlo es más honesto que tener una tercera copia
// que algún día diga algo distinto de las otras dos.
import { PushToggle } from "../my-pocket/ajustes/push-toggle";
import { IdentityForm } from "./identity-form";

export const metadata: Metadata = {
  title: "Tu perfil",
  description: "Tu nombre, tu usuario y los ajustes que valen para todo.",
};

/**
 * Lee el perfil aunque la migración 0012 no se haya corrido.
 *
 * Sin este reintento la pantalla entera reventaría por una columna que falta,
 * y lo único que hay que hacer es correr un SQL: mejor mostrar el perfil sin
 * apodo y dejar que el error aparezca al guardar, donde dice qué hacer.
 */
async function loadProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<UserProfile> {
  const full = await supabase
    .from("users_profiles")
    .select("name,username,notification_email")
    .eq("user_id", userId)
    .maybeSingle();

  if (!full.error) {
    return (full.data as UserProfile | null) ?? {
      name: null,
      username: null,
      notification_email: null,
    };
  }

  const { data } = await supabase
    .from("users_profiles")
    .select("name,notification_email")
    .eq("user_id", userId)
    .maybeSingle();

  const row = (data as Omit<UserProfile, "username"> | null) ?? {
    name: null,
    notification_email: null,
  };

  return { ...row, username: null };
}

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const supabase = await createClient();
  const profile = await loadProfile(supabase, user.id);

  const fullName = resolveName(profile.name, user.name, user.email);
  const initials = initialsOf(fullName) || "LU";

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <NavLink
          href="/hub"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Hub
        </NavLink>
        <span className="eyebrow">Perfil</span>
      </header>

      <section className="mt-2 mb-1">
        <h1
          className="display rise emboss text-[clamp(2.25rem,11vw,3rem)]"
          style={{ "--d": "110ms" } as CSSProperties}
        >
          Vos,
          <span className="block text-[var(--accent-ink)]">y cómo se ve todo</span>
        </h1>
        <div
          className="rise mt-5 flex items-center gap-3"
          style={{ "--d": "170ms" } as CSSProperties}
        >
          <span className="key flex size-11 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold text-[var(--text-2)]">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.875rem] font-medium">
              {profile.username ? `@${profile.username}` : fullName}
            </span>
            <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
              {user.email}
            </span>
          </span>
        </div>
      </section>

      <div className="rise" style={{ "--d": "400ms" } as CSSProperties}>
        <IdentityForm profile={profile} email={user.email} />
      </div>

      <section
        className="plate rise flex items-center gap-4 p-5"
        style={{ "--d": "460ms" } as CSSProperties}
      >
        <span className="min-w-0 flex-1">
          <p className="eyebrow">Cómo se ve</p>
          <h2 className="display mt-2 text-[1.625rem]">Tema</h2>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
            Automático sigue lo que tenga puesto tu teléfono.
          </p>
        </span>
        <ThemeSwitch />
      </section>

      <div className="rise" style={{ "--d": "520ms" } as CSSProperties}>
        <PushToggle
          admin={isAdmin(user.email)}
          note="Recordatorios, quincena y hábitos llegan acá aunque tengas la app cerrada. Se activa por dispositivo: el teléfono y la laptop van aparte."
        />
      </div>

      {/*
        Lo que sigue siendo de cada herramienta se queda en cada herramienta:
        las fechas de pago no significan nada fuera de My Pocket. Acá van los
        atajos, para que "dónde se configuraba esto" tenga una sola respuesta.
      */}
      <section
        className="plate rise p-5"
        style={{ "--d": "580ms" } as CSSProperties}
      >
        <p className="eyebrow">Por herramienta</p>
        <h2 className="display mt-2 text-[1.625rem]">Ajustes propios</h2>
        <p className="mt-2 mb-4 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
          Lo que solo tiene sentido adentro de una herramienta vive adentro de
          ella. Desde acá se llega en un toque.
        </p>

        <div className="flex flex-col gap-3">
          <SettingsLink
            href="/hub/my-pocket/ajustes"
            title="My Pocket"
            note="Ingreso, fechas de pago, gastos fijos y categorías."
            icon={<Wallet className="size-5" />}
          />
          <SettingsLink
            href="/hub/clean-daily/habitos"
            title="Clean Daily"
            note="Tus hábitos, sus horarios y sus recordatorios."
            icon={<Slate className="size-5" />}
          />
        </div>
      </section>

      <section
        className="plate rise p-5"
        style={{ "--d": "640ms" } as CSSProperties}
      >
        <p className="eyebrow">Sesión</p>
        <h2 className="display mt-2 text-[1.625rem]">Tu cuenta</h2>
        <p className="mt-2 mb-4 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
          Entraste con {user.email}. Ese correo lo maneja Google, así que no se
          cambia desde acá.
        </p>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="key flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
          >
            <Power className="size-4" />
            Cerrar sesión
          </button>
        </form>
      </section>
    </main>
  );
}

/** Un atajo a los ajustes de una herramienta. */
function SettingsLink({
  href,
  title,
  note,
  icon,
}: {
  href: string;
  title: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <NavLink
      href={href}
      className="groove flex items-center gap-3 p-4 transition-[filter] duration-300 active:brightness-95"
    >
      <span className="key flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--accent-ink)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] font-medium">{title}</span>
        <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
          {note}
        </span>
      </span>
      <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--text-3)]" />
    </NavLink>
  );
}
