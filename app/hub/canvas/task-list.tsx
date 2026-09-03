"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Chevron, Trash } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { readDue, type DueTone } from "@/lib/canvas";
import { removeAssignment } from "./actions";
import { TASK_PATH } from "./paths";

/** El color de lo que falta. El azul no se usa: el azul es para tocar. */
const TONE_INK: Record<DueTone, string> = {
  overdue: "var(--s-late)",
  today: "var(--s-late)",
  soon: "var(--s-soon)",
  later: "var(--s-ink-3)",
  none: "var(--s-ink-3)",
};

export type ListRow = {
  id: string;
  title: string;
  course_name: string;
  due_at: string | null;
};

/**
 * Tu lista, con un modo de edición.
 *
 * Quitar no vive detrás de un deslizamiento ni de una pulsación larga: los
 * dos son gestos que hay que saber de antemano. Vive detrás de "Editar",
 * como en las listas del sistema, y en modo normal la fila entera sigue
 * siendo un enlace a la tarea.
 *
 * Quitar una tarea la devuelve al importador: es la forma de volver a
 * traerla desde cero cuando el profesor rehizo el enunciado.
 */
export function TaskList({
  rows,
  nowIso,
}: {
  rows: ListRow[];
  /** El reloj del servidor: si cada lado usa el suyo, React no hidrata. */
  nowIso: string;
}) {
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const now = new Date(nowIso);

  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="s-eyebrow">Tu lista</h2>
        <button
          type="button"
          onClick={() => {
            setEditing((current) => !current);
            setAsking(null);
          }}
          className="s-link text-[0.9375rem]"
        >
          {editing ? "Listo" : "Editar"}
        </button>
      </div>

      <ul className="mt-4 flex flex-col">
        {rows.map((row, index) => {
          const due = readDue(row.due_at, now);

          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="s-caption block truncate">
                  {row.course_name}
                </span>
                <span className="s-head mt-1.5 block">{row.title}</span>
                <span
                  className="s-tag mt-2.5"
                  style={{ color: TONE_INK[due.tone] }}
                >
                  {due.label}
                </span>
              </span>
              {editing ? (
                <Trash className="size-[1.125rem] shrink-0 text-[var(--s-late)]" />
              ) : (
                <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--s-ink-3)]" />
              )}
            </>
          );

          return (
            <li
              key={row.id}
              className="s-rise border-b border-[var(--s-hair)]"
              style={{ "--d": `${420 + index * 60}ms` } as CSSProperties}
            >
              {editing ? (
                <button
                  type="button"
                  onClick={() => setAsking(asking === row.id ? null : row.id)}
                  className="flex w-full items-center gap-4 py-5 text-left"
                >
                  {body}
                </button>
              ) : (
                <NavLink
                  href={`${TASK_PATH}/${row.id}`}
                  className="flex items-center gap-4 py-5"
                >
                  {body}
                </NavLink>
              )}

              {asking === row.id ? (
                <div className="pb-5">
                  <p className="s-body">
                    Se quita de tu lista con su recordatorio, sus borradores y
                    su material. Vuelve a aparecer para importar.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startPending(async () => {
                          await removeAssignment(row.id);
                          setAsking(null);
                        })
                      }
                      className="s-pill h-10 min-h-10 text-[0.9375rem]"
                      style={{ backgroundColor: "var(--s-late)" }}
                    >
                      {pending ? "Quitando…" : "Quitar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsking(null)}
                      className="s-link text-[0.9375rem]"
                    >
                      Mejor no
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
