import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import {
  ArrowOut,
  CartTag,
  Slate,
  Sliders,
  Spark,
  Wallet,
  WaveHand,
} from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { ThemeSwitch } from "@/components/theme-switch";
import { currentUser } from "@/lib/auth";
import { initialsOf, resolveName } from "@/lib/profile";
import { STATUS_LABEL, TOOLS, type Tool } from "@/lib/tools";
import { createClient } from "@/lib/supabase/server";
import { HubNotice } from "./hub-notice";

export const metadata: Metadata = {
  title: "Tu hub",
  description: "Todas tus herramientas en un solo lugar.",
};

export default async function HubPage() {
  // El proxy ya verificó la sesión en esta misma petición: leerla de la
  // cabecera evita un segundo viaje a Supabase antes de la única consulta
  // que esta pantalla necesita.
  const user = await currentUser();

  if (!user) redirect("/");

  const supabase = await createClient();

  // `username` llegó en la migración 0012. Si no se corrió, la consulta falla
  // entera y el hub se quedaría sin saludo por una columna que falta: se
  // reintenta sin ella y el perfil explica qué hacer.
  const full = await supabase
    .from("users_profiles")
    .select("name,username")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = full.error
    ? {
        ...((
          await supabase
            .from("users_profiles")
            .select("name")
            .eq("user_id", user.id)
            .maybeSingle()
        ).data as { name: string | null } | null),
        username: null,
      }
    : (full.data as { name: string | null; username: string | null } | null);

  const fullName = resolveName(profile?.name, user.name, user.email);
  const username = profile?.username ?? null;
  const firstName = fullName.trim().split(/\s+/)[0];
  const initials = initialsOf(fullName);

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/*
        Lo pendiente va antes que el saludo: instalar la app y encender los
        avisos caducan, el saludo no. Se calla con la cruz y no vuelve por
        semanas.
      */}
      <HubNotice />

      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        {/*
          El selector se queda con la derecha, así que el estado de conexión
          pierde su rótulo y se muda al punto que ya lo acompañaba: sigue
          latiendo al lado de la marca, y lo dice por accesibilidad.
        */}
        <span className="flex items-center gap-2.5">
          <span
            role="status"
            aria-label="En línea"
            title="En línea"
            className="pulse-dot size-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
          />
          <span className="eyebrow">Lifestyle Utilities</span>
        </span>
        <ThemeSwitch />
      </header>

      {/* Momento firma: el saludo ocupa la pantalla */}
      <section className="mt-3">
        <p
          className="rise text-[1.375rem] leading-none text-[var(--text-2)]"
          style={{ "--d": "110ms" } as CSSProperties}
        >
          Hola,
        </p>
        <h1
          className="display rise emboss mt-2 flex flex-wrap items-end gap-x-4 gap-y-2 text-[clamp(2.75rem,13vw,4rem)]"
          style={{ "--d": "170ms" } as CSSProperties}
        >
          <span>{firstName}</span>
          <WaveHand className="wave-hand mb-1 size-[0.85em] shrink-0 text-[var(--accent-ink)]" />
        </h1>
      </section>

      {/*
        Bento de verdad: dos columnas y tamaños desiguales. Cuando las
        herramientas son impares la primera ocupa el ancho completo y las demás
        van de a dos; cuando son pares entran todas en pareja. La regla existe
        para que nunca quede un hueco que haya que rellenar con una placa
        vacía: el ritmo lo dan las piezas reales, no un cartel de "próximamente".
      */}
      <div className="grid grid-cols-2 gap-3">
        {TOOLS.map((tool, index) => (
          <ToolTile
            key={tool.slug}
            tool={tool}
            wide={TOOLS.length % 2 === 1 && index === 0}
            delay={460 + index * 90}
          />
        ))}
      </div>

      {/*
        La tarjeta de abajo dejó de ser un cartel con un botón de salir: ahora
        es la puerta al perfil, donde viven el nombre, el usuario y todo lo que
        vale para las tres herramientas. Cerrar sesión se hace adentro, que es
        donde uno espera encontrarlo y no a un toque de distancia por error.
      */}
      <footer className="mt-auto pt-5">
        <NavLink
          href="/hub/perfil"
          aria-label="Tu perfil y ajustes"
          className="plate rise flex items-center gap-3 p-3 transition-[transform,filter] duration-500 [transition-timing-function:var(--ease-expo)] active:scale-[0.985] active:brightness-95"
          style={{ "--d": "540ms" } as CSSProperties}
        >
          <span className="key flex size-11 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold text-[var(--text-2)]">
            {initials || "LU"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.875rem] font-medium">
              {fullName}
            </span>
            <span className="block truncate text-[0.75rem] text-[var(--text-3)]">
              {username ? `@${username}` : user.email}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="key flex size-11 items-center justify-center rounded-full text-[var(--text-2)]"
          >
            <Sliders className="size-[1.125rem]" />
          </span>
        </NavLink>
      </footer>
    </main>
  );
}

/** El icono de cada herramienta: un glifo propio, nunca una librería. */
function ToolGlyph({
  iconKey,
  wide,
}: {
  iconKey: Tool["iconKey"];
  wide: boolean;
}) {
  const size = wide ? "size-7" : "size-6";
  if (iconKey === "cart") return <CartTag className={size} />;
  if (iconKey === "wallet") return <Wallet className={size} />;
  if (iconKey === "slate") return <Slate className={size} />;
  return <Spark className={wide ? "size-6" : "size-5"} />;
}

/**
 * Una pieza del bento.
 *
 * Sin rótulo de "Abrir" ni de "Listo para usar": la placa entera es el botón y
 * la flecha ya lo dice. Lo único que se anuncia es lo que todavía no se puede
 * usar, porque eso sí cambia lo que pasa al tocarla.
 */
function ToolTile({
  tool,
  wide,
  delay,
}: {
  tool: Tool;
  wide: boolean;
  delay: number;
}) {
  const isReady = tool.status === "live";

  const content = (
    <>
      {/* Halo del acento, hundido detrás del icono */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(circle, var(--accent-glow), transparent 68%)",
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`groove flex items-center justify-center text-[var(--accent-ink)] ${
            wide ? "size-14 rounded-[18px]" : "size-12 rounded-[16px]"
          }`}
        >
          <ToolGlyph iconKey={tool.iconKey} wide={wide} />
        </span>

        {isReady ? (
          <span
            aria-hidden="true"
            className={`key key-accent flex items-center justify-center rounded-full ${
              wide ? "size-11" : "size-9"
            }`}
          >
            <ArrowOut className={wide ? "size-4" : "size-3.5"} />
          </span>
        ) : (
          <span className={`chip ${wide ? "" : "gap-1.5 px-2 py-1 text-[0.625rem] tracking-[0.08em]"}`}>
            <span className="size-1.5 rounded-full bg-[var(--accent)]" />
            {STATUS_LABEL[tool.status]}
          </span>
        )}
      </div>

      <h2
        className={`display relative ${wide ? "mt-6 text-[2rem]" : "mt-auto pt-6 text-[1.375rem]"}`}
      >
        {tool.name}
      </h2>
      <p
        className={`relative text-[var(--text-2)] ${
          wide ? "mt-2 text-[0.9375rem]" : "mt-1.5 text-[0.75rem] leading-snug"
        }`}
      >
        {tool.tagline}
      </p>

      {/* La descripción larga solo cabe en la placa ancha; en la chica el
          subtítulo ya dice para qué sirve. */}
      {wide ? (
        <p className="relative mt-3 text-[0.8125rem] leading-relaxed text-[var(--text-3)]">
          {tool.description}
        </p>
      ) : null}
    </>
  );

  const className = [
    "plate rise relative block overflow-hidden transition-[transform,filter] duration-500 [transition-timing-function:var(--ease-expo)] active:scale-[0.985] active:brightness-95",
    wide ? "col-span-2 p-5" : "flex aspect-[5/6] flex-col p-4",
  ].join(" ");

  if (!isReady) {
    return (
      <article
        className={className}
        style={{ "--d": `${delay}ms` } as CSSProperties}
      >
        {content}
      </article>
    );
  }

  return (
    <NavLink
      href={tool.href}
      className={className}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      {content}
    </NavLink>
  );
}
