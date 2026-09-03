"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Check, Cross, Phone, Share, Spark } from "@/components/icons";
import {
  ensureServiceWorker,
  promptInstall,
  readInstallState,
} from "@/lib/install";
import { enablePush, readPushStatus } from "@/lib/push-client";
import { isSnoozed, snooze } from "@/lib/snooze";
import { savePushSubscription } from "./my-pocket/ajustes/push-actions";

const INSTALL_KEY = "hub:install-snoozed";
const INSTALL_DAYS = 14;
const PUSH_KEY = "hub:push-snoozed";
const PUSH_DAYS = 7;

/** Lo único que este aparato tiene pendiente, si es que tiene algo. */
type Notice = "none" | "install" | "ios" | "push";

/**
 * La barra de pendientes del hub.
 *
 * Vive arriba de todo porque es lo único de esta pantalla que caduca: poner la
 * app en la pantalla de inicio y encender los avisos son pasos de una sola vez,
 * y abajo del bento nadie los ve. Pero arriba se paga con atención, así que se
 * cobra lo mínimo: una sola barra, nunca dos, y siempre con la cruz para
 * callarla —dos semanas la instalación, una los avisos.
 *
 * El orden no es arbitrario, es la dependencia real: en iPhone no hay push
 * hasta que la app corre desde el ícono. Por eso primero se ofrece instalar y
 * los avisos aparecen recién cuando ya no hay nada que instalar.
 */
export function HubNotice() {
  const [notice, setNotice] = useState<Notice>("none");
  const [steps, setSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"installed" | "push" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const look = useCallback(async () => {
    const install = readInstallState();
    const pending = install === "ready" || install === "ios";

    if (pending && !isSnoozed(INSTALL_KEY, INSTALL_DAYS)) {
      setNotice(install === "ios" ? "ios" : "install");
      return;
    }

    // Ya instalada (o este navegador no ofrece instalar nada): el turno es de
    // los avisos. `readPushStatus` ya descarta el iPhone sin instalar.
    const push = await readPushStatus().catch(() => "unsupported" as const);
    setNotice(push === "off" && !isSnoozed(PUSH_KEY, PUSH_DAYS) ? "push" : "none");
  }, []);

  useEffect(() => {
    let alive = true;
    const check = () => {
      if (alive) void look();
    };

    // El service worker es el que enciende la instalabilidad en Chrome y el que
    // recibe el push: hasta que existe no hay nada que ofrecer.
    ensureServiceWorker().then(check);

    addEventListener("installpromptready", check);
    addEventListener("appinstalled", check);

    return () => {
      alive = false;
      removeEventListener("installpromptready", check);
      removeEventListener("appinstalled", check);
    };
  }, [look]);

  function dismiss() {
    snooze(notice === "push" ? PUSH_KEY : INSTALL_KEY);
    setNotice("none");
  }

  async function act() {
    if (notice === "ios") {
      setSteps((open) => !open);
      return;
    }

    setBusy(true);
    setError(null);

    if (notice === "install") {
      const outcome = await promptInstall();
      setBusy(false);
      // "Ahora no" en el diálogo nativo cuenta como no: Chrome no vuelve a dar
      // el evento, así que la barra se calla en vez de quedarse muerta.
      if (outcome === "accepted") setDone("installed");
      else dismiss();
      return;
    }

    const outcome = await enablePush(savePushSubscription);
    setBusy(false);
    if (outcome.status === "error") setError(outcome.error);
    else if (outcome.status === "on") setDone("push");
    else dismiss();
  }

  if (done) {
    return (
      <Bar delay={260}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--tint)] text-[var(--accent-ink)]">
          <Check className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-[var(--text-2)]">
          {done === "installed"
            ? "Listo. Buscá el ícono en tu pantalla de inicio."
            : "Avisos encendidos en este dispositivo."}
        </p>
      </Bar>
    );
  }

  if (notice === "none") return null;

  const copy = {
    install: {
      title: "Instalala como app",
      hint: "Pantalla completa, sin barra del navegador.",
      action: "Instalar",
    },
    ios: {
      title: "Instalala como app",
      hint: "Tres pasos en Safari. Es lo que habilita los avisos.",
      action: steps ? "Cerrar" : "Cómo",
    },
    push: {
      title: "Avisos apagados",
      hint: "Salario, gastos que vencen y tus hábitos del día.",
      action: "Activar",
    },
  }[notice];

  return (
    <Bar delay={260}>
      <span className="groove flex size-11 shrink-0 items-center justify-center rounded-[15px] text-[var(--accent-ink)]">
        {notice === "push" ? (
          <Spark className="size-4" />
        ) : (
          <Phone className="size-5" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] leading-snug font-medium">
          {copy.title}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-[var(--text-3)]">
          {copy.hint}
        </span>
      </span>

      <button
        type="button"
        onClick={act}
        disabled={busy}
        aria-expanded={notice === "ios" ? steps : undefined}
        className="key key-accent flex h-9 shrink-0 items-center rounded-full px-4 text-[0.75rem] font-semibold disabled:opacity-60"
      >
        {busy ? "…" : copy.action}
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Ahora no"
        className="-mt-1 -mr-0.5 flex size-8 shrink-0 items-center justify-center self-start rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--text-1)]"
      >
        <Cross className="size-3" />
      </button>

      {steps ? <IOSSteps /> : null}

      {error ? (
        <p
          role="alert"
          className="basis-full text-[0.6875rem] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </Bar>
  );
}

/** La placa, siempre igual: lo que cambia es lo que lleva adentro. */
function Bar({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="plate rise relative flex flex-wrap items-center gap-x-3 gap-y-3 overflow-hidden p-3"
      style={{ "--d": `${delay}ms` } as CSSProperties}
      aria-live="polite"
    >
      {/* El halo sale del glifo, igual que en las placas del bento. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-14 -left-12 size-36 rounded-full opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(circle, var(--accent-glow), transparent 70%)",
        }}
      />
      {children}
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
    <ol className="relative basis-full space-y-2.5 pt-1">
      <Step number={1}>
        Tocá{" "}
        <span className="inline-flex translate-y-[0.15em] items-center px-0.5 text-[var(--accent-ink)]">
          <Share className="size-3.5" />
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
    <li className="flex items-start gap-2.5">
      <span className="groove flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold tabular-nums text-[var(--text-2)]">
        {number}
      </span>
      <span className="min-w-0 flex-1 pt-0.5 text-[0.75rem] leading-relaxed text-[var(--text-2)]">
        {children}
      </span>
    </li>
  );
}
