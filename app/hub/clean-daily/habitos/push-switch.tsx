"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { Check, Cross, Spark } from "@/components/icons";
import { enablePush, readPushStatus, type PushStatus } from "@/lib/push-client";
import {
  deletePushSubscription,
  savePushSubscription,
  sendHabitTestPush,
} from "../actions";

/**
 * El interruptor de los recordatorios, en vidrio.
 *
 * Existe una versión de esto en los ajustes de My Pocket y escribe en la
 * misma tabla —el permiso es del navegador, no de la herramienta—, pero
 * mandar a alguien a la otra app para encender el aviso de sus hábitos sería
 * absurdo. Acá vive la puerta de este módulo.
 *
 * El permiso solo se puede pedir dentro de un gesto real de la persona, así
 * que nada pasa al cargar: pasa cuando se toca el botón. En iPhone el
 * navegador no lo da hasta que la web está instalada en la pantalla de
 * inicio, y ese caso se explica en vez de fallar en silencio.
 */
export function PushSwitch({ delay = 0 }: { delay?: number }) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;

    readPushStatus()
      .then((next) => alive && setStatus(next))
      .catch(() => alive && setStatus("unsupported"));

    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setError(null);
    const outcome = await enablePush(savePushSubscription);

    if (outcome.status === "error") setError(outcome.error);
    else setStatus(outcome.status);
  }

  async function disable() {
    setError(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setStatus("off");
      setSent(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo desactivar.");
    }
  }

  return (
    <section
      className="pane settle flex flex-col gap-3 p-4"
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <div>
        <p className="glass-eyebrow">Recordatorios</p>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--g-ink-2)]">
          A la hora de cada hábito el teléfono dice tu señal en voz alta,
          aunque la app esté cerrada. Se activa por dispositivo.
        </p>
      </div>

      {status === "checking" ? (
        <p className="text-[0.8125rem] text-[var(--g-ink-3)]">Viendo si se puede…</p>
      ) : null}

      {status === "needs-install" ? (
        <div className="sunk p-3.5">
          <p className="text-[0.875rem] text-[var(--g-ink-2)]">
            En iPhone hay que instalar la app primero.
          </p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
            Tocá Compartir en Safari, después{" "}
            <span className="text-[var(--g-ink-2)]">Agregar a inicio</span>, y
            abrí Clean Daily desde el ícono nuevo. Volvé acá y el botón aparece.
          </p>
        </div>
      ) : null}

      {status === "unsupported" ? (
        <div className="sunk p-3.5">
          <p className="text-[0.875rem] text-[var(--g-ink-2)]">
            Este navegador no soporta avisos push.
          </p>
          <p className="mt-2 text-[0.75rem] text-[var(--g-ink-3)]">
            Los hábitos siguen funcionando igual; solo no te va a avisar nadie.
          </p>
        </div>
      ) : null}

      {status === "blocked" ? (
        <div className="sunk p-3.5">
          <p className="text-[0.875rem] text-[var(--g-ink-2)]">
            Bloqueaste los avisos para este sitio.
          </p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
            Se cambia desde el candado en la barra de direcciones, en permisos
            de notificaciones. El navegador no deja volver a preguntar.
          </p>
        </div>
      ) : null}

      {status === "off" ? (
        <button
          type="button"
          onClick={enable}
          className="gkey gkey-lit flex h-12 items-center justify-center gap-2 text-[0.875rem]"
        >
          <Spark className="size-4" />
          Activar en este dispositivo
        </button>
      ) : null}

      {status === "on" ? (
        <div className="flex flex-col gap-2.5">
          <div className="sunk flex items-center gap-3 p-3.5">
            <Check className="size-4 shrink-0 text-[var(--g-good-ink)]" />
            <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--g-ink-2)]">
              Activo en este dispositivo
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const outcome = await sendHabitTestPush();
                  if (outcome.status === "error") {
                    setError(outcome.error ?? null);
                    setSent(false);
                  } else {
                    setError(null);
                    setSent(true);
                  }
                })
              }
              className="gkey flex h-11 items-center justify-center text-[0.8125rem] disabled:opacity-60"
            >
              {pending ? "Mandando…" : sent ? "Mandar otro" : "Probar"}
            </button>
            <button
              type="button"
              onClick={disable}
              className="gkey flex h-11 items-center justify-center gap-2 text-[0.8125rem]"
            >
              <Cross className="size-3" />
              Desactivar
            </button>
          </div>

          <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
            La prueba usa tu primer hábito con hora, así ves el texto exacto
            que te va a llegar.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--g-bad-ink)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
