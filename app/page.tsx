import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/google-sign-in";
import { ThemeSwitch } from "@/components/theme-switch";
import { Spark } from "@/components/icons";
import { currentUser } from "@/lib/auth";

const ERROR_COPY: Record<string, string> = {
  oauth: "Google canceló el acceso. Probá de nuevo.",
  exchange: "No pudimos validar tu sesión. Intentá otra vez.",
  missing_code: "El enlace de acceso venció. Volvé a entrar con Google.",
};

export default async function LoginPage({ searchParams }: PageProps<"/">) {
  // La sesión ya viene resuelta por el proxy; esto no sale a la red.
  const user = await currentUser();

  if (user) redirect("/hub");

  const { error } = await searchParams;
  const errorKey = typeof error === "string" ? error : undefined;
  const errorMessage = errorKey
    ? (ERROR_COPY[errorKey] ?? ERROR_COPY.exchange)
    : null;

  return (
    <main className="flex flex-1 flex-col px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "50ms" } as React.CSSProperties}
      >
        <span className="eyebrow">Lifestyle Utilities</span>
        <ThemeSwitch />
      </header>

      {/* La pantalla entera es una sola placa mecanizada */}
      <section className="plate rise relative mt-16 flex flex-1 flex-col justify-end overflow-hidden px-6 pt-24 pb-7">
        {/* Remaches embutidos en las esquinas */}
        <Rivets />

        {/* Marca semihundida en el borde superior de la placa */}
        <div className="key absolute top-0 left-6 flex size-16 -translate-y-1/2 items-center justify-center rounded-[20px]">
          <Spark className="size-7 text-[var(--accent-ink)] drop-shadow-[0_0_12px_var(--accent-glow)]" />
        </div>

        <div className="relative">
          <h1
            className="display rise emboss text-[clamp(3.5rem,17vw,5.25rem)]"
            style={{ "--d": "130ms" } as React.CSSProperties}
          >
            Lifestyle
            <span className="block pl-[0.55em] text-[var(--accent-ink)]">
              Utilities
            </span>
          </h1>

          <p
            className="rise mt-7 max-w-[19rem] pl-px text-[0.9375rem] leading-relaxed text-[var(--text-2)]"
            style={{ "--d": "240ms" } as React.CSSProperties}
          >
            Herramientas pequeñas y afiladas para las decisiones que hacen
            grande tu día a día.
          </p>
        </div>

        {/* Ranura separadora */}
        <div
          className="fade mt-9 h-px w-full bg-gradient-to-r from-transparent via-[var(--edge-strong)] to-transparent"
          style={{ "--d": "340ms" } as React.CSSProperties}
        />

        <div
          className="rise mt-7"
          style={{ "--d": "380ms" } as React.CSSProperties}
        >
          <GoogleSignIn />

          {errorMessage ? (
            <p
              role="alert"
              className="mt-4 text-center text-[0.8125rem] text-[var(--danger)]"
            >
              {errorMessage}
            </p>
          ) : null}

          <p className="mt-5 text-center text-[0.75rem] leading-relaxed text-[var(--text-3)]">
            Sin contraseñas. Sin formularios.
            <br />
            Solo tu cuenta de Google.
          </p>
        </div>
      </section>
    </main>
  );
}

function Rivets() {
  const positions = [
    "top-4 left-4",
    "top-4 right-4",
    "bottom-4 left-4",
    "bottom-4 right-4",
  ];

  return (
    <>
      {positions.map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={`absolute ${position} size-1.5 rounded-full bg-[var(--sunk-1)] shadow-[var(--inset)]`}
        />
      ))}
    </>
  );
}
