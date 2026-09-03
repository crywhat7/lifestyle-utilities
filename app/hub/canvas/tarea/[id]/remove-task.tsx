"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CANVAS_PATH } from "../../paths";
import { removeAssignment } from "../../actions";

/**
 * Sacar la tarea de la lista.
 *
 * Con confirmación en el lugar, no en un diálogo del navegador: lo que se
 * pierde —el recordatorio y los borradores— hay que poder leerlo antes de
 * decidir, y un `confirm()` no lo dice.
 */
export function RemoveTask({
  id,
  hasReminder,
}: {
  id: string;
  hasReminder: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, startPending] = useTransition();
  const router = useRouter();

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="s-link"
        style={{ color: "var(--s-late)" }}
      >
        Quitar de mi lista
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="s-body">
        Se borra la tarea, sus borradores
        {hasReminder ? " y su recordatorio de Clean Daily" : ""}. En Canvas no
        cambia nada.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startPending(async () => {
              await removeAssignment(id);
              router.push(CANVAS_PATH);
            })
          }
          className="s-pill"
          style={{ backgroundColor: "var(--s-late)" }}
        >
          {pending ? "Quitando…" : "Quitar"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="s-link"
        >
          Mejor no
        </button>
      </div>
    </div>
  );
}
