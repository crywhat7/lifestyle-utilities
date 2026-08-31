import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import {
  ArrowOut,
  CartTag,
  PlusSlot,
  Power,
  Spark,
  Wallet,
  WaveHand,
} from "@/components/icons";
import { ThemeSwitch } from "@/components/theme-switch";
import { STATUS_LABEL, TOOLS, type Tool } from "@/lib/tools";
import { createClient } from "@/lib/supabase/server";
import { InstallPrompt } from "./install-prompt";

export const metadata: Metadata = {
  title: "Tu hub",
  description: "Todas tus herramientas en un solo lugar.",
};

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users_profiles")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();

  const fullName: string =
    profile?.name ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "invitado";
  const firstName = fullName.trim().split(/\s+/)[0];
  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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

      {/* Bento */}
      <div className="grid grid-cols-2 gap-3">
        {TOOLS.map((tool, index) => (
          <ToolTile key={tool.slug} tool={tool} delay={460 + index * 110} />
        ))}

        <EmptySlot delay={720} label="Espacio libre" />
        <EmptySlot delay={790} label="Próxima idea" />
      </div>

      <InstallPrompt />

      <footer className="mt-auto pt-5">
        <div
          className="plate rise flex items-center gap-3 p-3"
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
              {user.email}
            </span>
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="key flex size-11 items-center justify-center rounded-full text-[var(--text-2)]"
            >
              <Power className="size-[1.125rem]" />
            </button>
          </form>
        </div>
      </footer>
    </main>
  );
}

/** El icono de cada herramienta: un glifo propio, nunca una librería. */
function ToolGlyph({ iconKey }: { iconKey: Tool["iconKey"] }) {
  if (iconKey === "cart") return <CartTag className="size-7" />;
  if (iconKey === "wallet") return <Wallet className="size-7" />;
  return <Spark className="size-6" />;
}

function ToolTile({ tool, delay }: { tool: Tool; delay: number }) {
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

      <div className="relative flex items-start justify-between gap-4">
        <span className="groove flex size-14 items-center justify-center rounded-[18px] text-[var(--accent-ink)]">
          <ToolGlyph iconKey={tool.iconKey} />
        </span>

        <span className="chip">
          {!isReady ? (
            <span className="size-1.5 rounded-full bg-[var(--accent)]" />
          ) : null}
          {STATUS_LABEL[tool.status]}
        </span>
      </div>

      <h2 className="display relative mt-6 text-[1.875rem]">{tool.name}</h2>
      <p className="relative mt-2 text-[0.9375rem] text-[var(--text-2)]">
        {tool.tagline}
      </p>
      <p className="relative mt-3 text-[0.8125rem] leading-relaxed text-[var(--text-3)]">
        {tool.description}
      </p>

      <div className="relative mt-6 flex items-center justify-between">
        <span className="text-[0.75rem] text-[var(--text-3)]">
          {isReady ? "Listo para usar" : "En construcción"}
        </span>
        <span
          aria-hidden="true"
          className={`key flex size-10 items-center justify-center rounded-full ${
            isReady ? "key-accent" : "text-[var(--text-3)]"
          }`}
        >
          <ArrowOut className="size-4" />
        </span>
      </div>
    </>
  );

  const className =
    "plate rise relative col-span-2 block overflow-hidden p-5 transition-[transform,filter] duration-500 [transition-timing-function:var(--ease-expo)] active:scale-[0.985] active:brightness-95";

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
    <Link
      href={tool.href}
      className={className}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      {content}
    </Link>
  );
}

function EmptySlot({ delay, label }: { delay: number; label: string }) {
  return (
    <div
      className="groove rise flex aspect-square flex-col items-center justify-center gap-2 border-dashed border-[var(--edge)] text-[var(--text-3)]"
      style={{ "--d": `${delay}ms` } as CSSProperties}
      aria-hidden="true"
    >
      <PlusSlot className="size-5 opacity-50" />
      <span className="text-[0.6875rem] tracking-[0.14em] uppercase">
        {label}
      </span>
    </div>
  );
}
