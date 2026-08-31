"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check, Cross, Phone, Share } from "@/components/icons";
import {
  ensureServiceWorker,
  promptInstall,
  readInstallState,
  type InstallState,
} from "@/lib/install";
import { isSnoozed, snooze } from "@/lib/snooze";

const SNOOZE_KEY = "hub:install-snoozed";
const SNOOZE_DAYS = 14;

/**
 * La invitación a instalar la app.
 *
 * Vive en el hub y no dentro de una herramienta: instalar es de la app entera,
 * y acá no le compite a un saldo. Solo aparece si hay algo que hacer — si ya
 * corre desde el ícono, o si este navegador no ofrece ninguna vía, no ocupa un
 * píxel. Y se puede callar por dos semanas: insistir cada vez que abrís el hub
 * es la definición de molesto.
 */
export function InstallPrompt() {
  const [state, setState] = useState<InstallState>("checking");
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;

    function look() {
      if (!alive) return;
      setHidden(isSnoozed(SNOOZE_KEY, SNOOZE_DAYS));
      setState(readInstallState());
    }

    // El service worker es el que enciende la instalabilidad en Chrome: hasta
    // que existe, el navegador no tiene nada que ofrecer. Se registra primero
    // y recién después se pregunta qué se puede hacer.
    ensureServiceWorker().then(look);

    // Y si el evento llega tarde —el service worker acaba de activarse— la
    // tarjeta aparece sola en vez de esperar a la próxima visita.
    addEventListener("installpromptready", look);
    addEventListener("appinstalled", look);

    return () => {
      alive = false;
      removeEventListener("installpromptready", look);
      removeEventListener("appinstalled", look);
    };
  }, []);

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);

    // "Ahora no" en el diálogo nativo cuenta como no: Chrome no vuelve a dar
    // el evento, así que la tarjeta se calla en vez de quedarse muerta.
    if (outcome === "accepted") setDone(true);
    else dismiss();
  }

  function dismiss() {
    snooze(SNOOZE_KEY);
    setHidden(true);
  }

  if (done) {
    return (
      <section
        className="rise groove flex items-center gap-3 p-4"
        style={{ "--d": "860ms" } as CSSProperties}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
          <Check className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--text-2)]">
          Listo. Buscá el ícono en tu pantalla de inicio.
        </span>
      </section>
    );
  }

  const actionable = state === "ready" || state === "ios";
  if (!actionable || hidden) return null;

  return (
    <section
      className="plate rise relative overflow-hidden p-5"
      style={{ "--d": "860ms" } as CSSProperties}
    >
      {/* El halo sale del glifo, igual que en las placas de herramienta. */}
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
          <Phone className="size-7" />
        </span>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="-mt-1 -mr-1 flex size-9 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--text-1)]"
        >
          <Cross className="size-3.5" />
        </button>
      </div>

      <h2 className="display relative mt-6 text-[1.75rem]">
        Ponela en tu pantalla de inicio
      </h2>
      <p className="relative mt-3 text-[0.875rem] leading-relaxed text-[var(--text-2)]">
        {state === "ready"
          ? "Se abre como una app, a pantalla completa y sin barra del navegador. Ocupa casi nada y podés recibir avisos."
          : "Se abre como una app, a pantalla completa y sin barra del navegador. En iPhone también es lo que habilita los avisos."}
      </p>

      {state === "ready" ? (
        <button
          type="button"
          onClick={install}
          disabled={busy}
          className="key key-accent relative mt-6 flex h-13 w-full items-center justify-center rounded-full text-[0.9375rem] font-semibold disabled:opacity-60"
        >
          {busy ? "Instalando…" : "Instalar app"}
        </button>
      ) : (
        <IOSSteps />
      )}
    </section>
  );
}

/**
 * Los tres pasos de Safari.
 *
 * Van numerados y con el glifo real del botón Compartir: nadie reconoce ese
 * ícono por su nombre, pero todo el mundo lo reconoce al verlo.
 */
function IOSSteps() {
  return (
    <ol className="relative mt-6 flex flex-col gap-3">
      <Step number={1}>
        Tocá{" "}
        <span className="inline-flex translate-y-[0.15em] items-center px-0.5 text-[var(--accent-ink)]">
          <Share className="size-4" />
        </span>{" "}
        Compartir, abajo en Safari.
      </Step>
      <Step number={2}>
        Bajá y elegí{" "}
        <span className="text-[var(--text-1)]">Agregar a inicio</span>.
      </Step>
      <Step number={3}>
        Abrila desde el ícono nuevo. Esta pestaña ya no hace falta.
      </Step>
    </ol>
  );
}

function Step({
  number,
  children,
}: {
  number: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="groove flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums text-[var(--text-2)]">
        {number}
      </span>
      <span className="min-w-0 flex-1 pt-1 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
        {children}
      </span>
    </li>
  );
}
