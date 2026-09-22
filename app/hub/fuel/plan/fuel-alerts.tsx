"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { Check, Cross, Spark } from "@/components/icons";
import { enablePush, readPushStatus, type PushStatus } from "@/lib/push-client";
import {
  deletePushSubscription,
  savePushSubscription,
  sendFuelTestPush,
  setRemind,
} from "../actions";

/**
 * Los avisos del contador.
 *
 * Dos llaves distintas y por eso dos controles: el permiso del dispositivo
 * (que es del navegador y comparten las cuatro herramientas) y si Fuel en
 * particular tiene que hablar. Apagar los partes de calorías no debería
 * apagar los recordatorios de hábitos.
 */
export function FuelAlerts({ remind, delay = 0 }: { remind: boolean; delay?: number }) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [on, setOn] = useState(remind);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

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
    <section className="e-card kindle flex flex-col gap-4 p-5" style={{ "--d": `${delay}ms` } as CSSProperties}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="e-eyebrow">Avisos</p>
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-[var(--e-ink-2)]">
            A las 10:30, 14:30, 18:00 y 20:30 te decimos cuánto llevás y cuánto
            te falta. Si te pasás, te avisamos una vez.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Partes de calorías"
          disabled={pending}
          onClick={() => {
            const next = !on;
            setOn(next);
            start(() => setRemind(next));
          }}
          data-on={on}
          className="e-opt mt-1 h-9 w-16 shrink-0 justify-start px-1"
        >
          <span
            aria-hidden="true"
            className="block size-7 rounded-full transition-transform duration-300 [transition-timing-function:var(--e-ease)]"
            style={{
              transform: on ? "translateX(1.75rem)" : "translateX(0)",
              background: on ? "var(--e-lit)" : "var(--e-ash)",
            }}
          />
        </button>
      </div>

      {on ? (
        <>
          {status === "checking" ? (
            <p className="text-[0.8125rem] text-[var(--e-ink-3)]">Viendo si se puede…</p>
          ) : null}

          {status === "needs-install" ? (
            <p className="e-sunk p-3.5 text-[0.8125rem] leading-relaxed text-[var(--e-ink-2)]">
              En iPhone hay que instalar la app primero: Compartir en Safari,
              después <span className="text-[var(--e-ink)]">Agregar a inicio</span>, y
              abrila desde el ícono nuevo.
            </p>
          ) : null}

          {status === "unsupported" ? (
            <p className="e-sunk p-3.5 text-[0.8125rem] text-[var(--e-ink-2)]">
              Este navegador no soporta avisos push.
            </p>
          ) : null}

          {status === "blocked" ? (
            <p className="e-sunk p-3.5 text-[0.8125rem] leading-relaxed text-[var(--e-ink-2)]">
              Bloqueaste los avisos para este sitio. Se cambia desde el candado de
              la barra de direcciones.
            </p>
          ) : null}

          {status === "off" ? (
            <button
              type="button"
              onClick={enable}
              className="e-key flex h-12 items-center justify-center gap-2 text-[0.875rem]"
            >
              <Spark className="size-4" />
              Activar en este dispositivo
            </button>
          ) : null}

          {status === "on" ? (
            <div className="flex flex-col gap-2">
              <p className="e-sunk flex items-center gap-2.5 p-3.5 text-[0.8125rem] text-[var(--e-ink-2)]">
                <Check className="size-4 text-[var(--e-ink-hot)]" />
                Activo en este dispositivo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const outcome = await sendFuelTestPush();
                      setError(outcome.status === "error" ? (outcome.error ?? null) : null);
                      setSent(outcome.status === "saved");
                    })
                  }
                  className="e-key flex h-11 items-center justify-center text-[0.8125rem]"
                >
                  {pending ? "Mandando…" : sent ? "Mandar otro" : "Probar"}
                </button>
                <button
                  type="button"
                  onClick={disable}
                  className="e-key flex h-11 items-center justify-center gap-2 text-[0.8125rem]"
                >
                  <Cross className="size-3" />
                  Desactivar
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--e-over-ink)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
