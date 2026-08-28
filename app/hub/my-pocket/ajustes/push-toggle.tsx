"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Cross, Spark } from "@/components/icons";
import { enablePush, readPushStatus, type PushStatus } from "@/lib/push-client";
import {
  deletePushSubscription,
  savePushSubscription,
  sendAdminPush,
  sendTestPush,
} from "./push-actions";

/**
 * Interruptor de avisos push.
 *
 * El permiso solo se puede pedir dentro de un gesto real de la persona, así
 * que nada de esto pasa al cargar: pasa cuando se toca el botón. En iPhone el
 * navegador no da permiso hasta que la web está instalada en la pantalla de
 * inicio, y ese caso se explica en vez de fallar en silencio.
 */
export function PushToggle({ admin = false }: { admin?: boolean }) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
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
      setTested(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo desactivar.");
    }
  }

  return (
    <section className="plate p-5">
      <p className="eyebrow">Avisos</p>
      <h2 className="display mt-2 text-[1.625rem]">Notificaciones</h2>
      <p className="mt-2 mb-5 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
        Cuando entre tu salario te avisamos acá mismo, aunque tengas la app
        cerrada. Se activa por dispositivo: el teléfono y la laptop van aparte.
      </p>

      {status === "checking" ? (
        <p className="text-[0.8125rem] text-[var(--text-3)]">Viendo si se puede…</p>
      ) : null}

      {status === "needs-install" ? (
        <div className="groove p-4">
          <p className="text-[0.875rem] text-[var(--text-2)]">
            En iPhone hay que instalar la app primero.
          </p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
            Tocá Compartir en Safari, después{" "}
            <span className="text-[var(--text-2)]">Agregar a inicio</span>, y
            abrí My Pocket desde el ícono nuevo. Volvé acá y el botón aparece.
          </p>
        </div>
      ) : null}

      {status === "unsupported" ? (
        <div className="groove p-4">
          <p className="text-[0.875rem] text-[var(--text-2)]">
            Este navegador no soporta avisos push.
          </p>
          <p className="mt-2 text-[0.75rem] text-[var(--text-3)]">
            El correo te sigue llegando igual.
          </p>
        </div>
      ) : null}

      {status === "blocked" ? (
        <div className="groove p-4">
          <p className="text-[0.875rem] text-[var(--text-2)]">
            Bloqueaste los avisos para este sitio.
          </p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
            Se cambia desde el candado en la barra de direcciones, en permisos
            de notificaciones. El navegador no deja volver a preguntar.
          </p>
        </div>
      ) : null}

      {status === "off" ? (
        <button
          type="button"
          onClick={enable}
          className="key key-accent flex w-full items-center justify-center gap-2 rounded-full py-4 text-[0.9375rem] font-semibold"
        >
          <Spark className="size-4" />
          Activar en este dispositivo
        </button>
      ) : null}

      {status === "on" ? (
        <div className="flex flex-col gap-3">
          <div className="groove flex items-center gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-[var(--accent)]">
              <Check className="size-4" />
            </span>
            <span className="min-w-0 flex-1 text-[0.875rem] text-[var(--text-2)]">
              Activo en este dispositivo
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const outcome = await sendTestPush();
                  if (outcome.status === "error") setError(outcome.error ?? null);
                  else {
                    setError(null);
                    setTested(true);
                  }
                })
              }
              className="key flex h-12 items-center justify-center rounded-full text-[0.8125rem] text-[var(--text-2)] disabled:opacity-50"
            >
              {pending ? "Mandando…" : tested ? "Mandar otro" : "Probar"}
            </button>
            <button
              type="button"
              onClick={disable}
              className="key flex h-12 items-center justify-center gap-2 rounded-full text-[0.8125rem] text-[var(--text-2)]"
            >
              <Cross className="size-3" />
              Desactivar
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-center text-[0.8125rem] text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {admin && status === "on" ? (
        <AdminPanel onError={setError} />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Disparadores de los avisos reales, para probarlos en producción sin esperar
 * a que den la 1 de la tarde o caiga la quincena. Solo lo ve el administrador,
 * y la Server Action vuelve a verificarlo del lado del servidor.
 */
function AdminPanel({ onError }: { onError: (message: string | null) => void }) {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  function fire(kind: "reminder" | "salary", label: string) {
    startTransition(async () => {
      const outcome = await sendAdminPush(kind);
      if (outcome.status === "error") {
        onError(outcome.error ?? null);
        setLast(null);
      } else {
        onError(null);
        setLast(label);
      }
    });
  }

  return (
    <div className="mt-5 border-t border-[var(--edge)] pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="eyebrow">Pruebas</span>
        <span className="text-[0.6875rem] text-[var(--text-3)]">
          {last ? `Enviado: ${last}` : "Solo vos ves esto"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => fire("reminder", "recordatorio")}
          className="key flex h-12 items-center justify-center rounded-full text-[0.8125rem] text-[var(--text-2)] disabled:opacity-50"
        >
          Recordatorio
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => fire("salary", "quincena")}
          className="key flex h-12 items-center justify-center rounded-full text-[0.8125rem] text-[var(--text-2)] disabled:opacity-50"
        >
          Quincena
        </button>
      </div>

      <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
        Mandan el aviso real, el mismo que sale del cron. El recordatorio se
        arma con tus gastos de hoy, así ves el texto exacto.
      </p>
    </div>
  );
}
