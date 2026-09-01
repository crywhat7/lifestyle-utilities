"use client";

import {
  startTransition,
  useActionState,
  useOptimistic,
  useState,
  type CSSProperties,
} from "react";
import { Calendar, Check, Cross, Pin, PlusSlot, Trash } from "@/components/icons";
import { dueLabel, taskUrgency, type Task } from "@/lib/habits";
import { deleteTask, saveTask, toggleTask, type FormState } from "./actions";

const INITIAL: FormState = { status: "idle" };

export function TaskBoard({ open, done }: { open: Task[]; done: Task[] }) {
  const [adding, setAdding] = useState(false);
  const [dated, setDated] = useState(false);

  /*
    El cierre del formulario cuelga del resultado de la acción, no de un
    efecto que mire el estado después.

    Envolver la Server Action deja el "guardó bien → cerrá" en el mismo
    lugar donde se sabe: adentro de la transición que ya está corriendo.
    Con un `useEffect` sería un render extra por cada guardado, y encima uno
    que dispara mientras React todavía está pintando el anterior. Si falla,
    el formulario se queda abierto con lo escrito adentro.
  */
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await saveTask(prev, formData);
      if (result.status === "saved") {
        setAdding(false);
        setDated(false);
      }
      return result;
    },
    INITIAL
  );

  /*
    Marcar una tarea la saca de la lista en el mismo toque. La fila no se
    tacha en su lugar a propósito: la pila de arriba es "lo que falta", y una
    tarea resuelta que se queda ahí sigue ocupando la atención que se acaba
    de liberar.
  */
  const [live, complete] = useOptimistic(open, (prev: Task[], id: string) =>
    prev.filter((task) => task.id !== id)
  );

  return (
    <section className="flex flex-col gap-2.5">
      <div
        className="settle flex items-center justify-between"
        style={{ "--d": "80ms" } as CSSProperties}
      >
        <p className="glass-eyebrow flex items-center gap-2">
          <Pin className="size-3.5" />
          Pendientes
          {live.length > 0 ? (
            <span className="text-[var(--g-ink-2)]">{live.length}</span>
          ) : null}
        </p>

        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="gkey flex h-8 items-center gap-1.5 pr-3 pl-2.5 text-[0.75rem]"
        >
          {adding ? <Cross className="size-3" /> : <PlusSlot className="size-3.5" />}
          {adding ? "Cancelar" : "Nueva"}
        </button>
      </div>

      {adding ? (
        <form
          action={action}
          className="pane settle flex flex-col gap-2.5 p-3.5"
          style={{ "--d": "0ms" } as CSSProperties}
        >
          <input
            name="title"
            required
            maxLength={120}
            autoFocus
            placeholder="Llamar al dentista"
            className="gfield"
          />

          {dated ? (
            <input
              type="datetime-local"
              name="due_at"
              className="gfield"
              aria-label="Fecha y hora límite"
            />
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDated((value) => !value)}
              className={`gkey flex h-10 flex-1 items-center justify-center gap-2 text-[0.8125rem] ${
                dated ? "gkey-lit" : ""
              }`}
            >
              <Calendar className="size-3.5" />
              {dated ? "Con fecha" : "Sin fecha"}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="gkey gkey-lit flex h-10 flex-1 items-center justify-center text-[0.8125rem] disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Agregar"}
            </button>
          </div>

          {state.status === "error" ? (
            <p role="alert" className="text-center text-[0.8125rem] text-[var(--g-bad-ink)]">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : null}

      {live.length === 0 && !adding ? (
        <p
          className="settle text-[0.8125rem] text-[var(--g-ink-3)]"
          style={{ "--d": "140ms" } as CSSProperties}
        >
          Nada pendiente. Lo de hoy está abajo.
        </p>
      ) : null}

      {live.map((task, index) => {
        const urgency = taskUrgency(task);

        return (
          <article
            key={task.id}
            className="pane settle flex items-center gap-3 p-3.5"
            data-alert={urgency === "overdue"}
            style={{ "--d": `${140 + index * 55}ms` } as CSSProperties}
          >
            <button
              type="button"
              className="tick"
              aria-label={`Completar ${task.title}`}
              onClick={() =>
                startTransition(async () => {
                  complete(task.id);
                  await toggleTask(task.id, true);
                })
              }
            >
              <Check className="tick-mark size-5" />
            </button>

            <span className="min-w-0 flex-1">
              <span className="block text-[1.0625rem] leading-snug">
                {task.title}
              </span>
              <span
                className="mt-1 block text-[0.75rem]"
                style={{
                  color:
                    urgency === "overdue"
                      ? "var(--g-bad-ink)"
                      : "var(--g-ink-3)",
                }}
              >
                {dueLabel(task)}
              </span>
            </span>

            <button
              type="button"
              aria-label={`Borrar ${task.title}`}
              className="gkey flex size-9 items-center justify-center"
              onClick={() =>
                startTransition(async () => {
                  complete(task.id);
                  await deleteTask(task.id);
                })
              }
            >
              <Trash className="size-3.5" />
            </button>
          </article>
        );
      })}

      {/*
        Las últimas resueltas, en voz baja. No es un historial: es el deshacer
        de un toque mal dado, que en una lista táctil pasa todo el tiempo.
      */}
      {done.length > 0 ? (
        <details
          className="settle mt-1"
          style={{ "--d": "260ms" } as CSSProperties}
        >
          <summary className="glass-eyebrow cursor-pointer list-none">
            Resueltas hace poco · {done.length}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {done.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await toggleTask(task.id, false);
                    })
                  }
                  className="sunk flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <Check className="size-3.5 shrink-0 text-[var(--g-good-ink)]" />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-[var(--g-ink-3)] line-through">
                    {task.title}
                  </span>
                  <span className="gpill">Reabrir</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
