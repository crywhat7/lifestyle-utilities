"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { NavLink } from "@/components/nav-link";
import { Cross, Spark } from "@/components/icons";
import { enablePush, readPushStatus, type PushStatus } from "@/lib/push-client";
import { isSnoozed, snooze } from "@/lib/snooze";
import { savePushSubscription } from "./ajustes/push-actions";

/** Una semana de silencio: si dijo "ahora no", no se le insiste mañana. */
const SNOOZE_KEY = "pocket:push-nudge-snoozed";
const SNOOZE_DAYS = 7;

/**
 * El recordatorio de encender los avisos.
 *
 * Solo aparece cuando hay algo que hacer: el navegador puede recibir push y
 * esta persona todavía no lo activó en este dispositivo. Si ya está activo, si
 * lo bloqueó a nivel de navegador o si el navegador no sabe de push, esto no
 * ocupa un solo píxel — un aviso que no se puede atender es solo ruido.
 *
 * El permiso se pide desde acá mismo, en el mismo toque: mandar a Ajustes para
 * algo que son dos segundos es perder a la mitad en el camino.
 */
export function PushNudge() {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [snoozed, setSnoozed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    // El "ahora no" guardado se lee junto con el estado del navegador: son la
    // misma pregunta —¿hay algo que mostrar?— y así se resuelve en un render.
    readPushStatus()
      .then((next) => {
        if (!alive) return;
        setSnoozed(isSnoozed(SNOOZE_KEY, SNOOZE_DAYS));
        setStatus(next);
      })
      .catch(() => alive && setStatus("unsupported"));

    return () => {
      alive = false;
    };
  }, []);

  async function activate() {
    setBusy(true);
    setError(null);

    const outcome = await enablePush(savePushSubscription);

    setBusy(false);
    if (outcome.status === "error") setError(outcome.error);
    else setStatus(outcome.status);
  }

  function dismiss() {
    snooze(SNOOZE_KEY);
    setSnoozed(true);
  }

  const actionable = status === "off" || status === "needs-install";
  if (!actionable || snoozed) return null;

  return (
    <section
      className="rise groove relative overflow-hidden p-4"
      style={{ "--d": "300ms" } as CSSProperties}
      aria-live="polite"
    >
      {/* El resplandor sale del ícono: la fuente del aviso, no un adorno de fondo. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-10 size-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-start gap-3">
        <span className="pulse-dot flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
          <Spark className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] leading-snug font-medium">
            {status === "needs-install"
              ? "Instalá My Pocket para recibir avisos"
              : "Los avisos están apagados"}
          </p>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
            {status === "needs-install"
              ? "En iPhone: Compartir → Agregar a inicio, y abrila desde el ícono nuevo."
              : "Te avisamos cuando entre tu salario y cuando venza un gasto contemplado, aunque la tengas cerrada."}
          </p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--text-1)]"
        >
          <Cross className="size-3" />
        </button>
      </div>

      <div className="relative mt-3.5">
        {status === "needs-install" ? (
          <NavLink
            href="/hub/my-pocket/ajustes"
            className="key flex h-11 items-center justify-center rounded-full px-5 text-[0.8125rem] text-[var(--text-2)]"
          >
            Cómo se hace
          </NavLink>
        ) : (
          <button
            type="button"
            onClick={activate}
            disabled={busy}
            className="key key-accent flex h-11 w-full items-center justify-center gap-2 rounded-full text-[0.875rem] font-semibold disabled:opacity-60"
          >
            {busy ? "Activando…" : "Activar avisos"}
          </button>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="relative mt-2.5 text-center text-[0.75rem] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
