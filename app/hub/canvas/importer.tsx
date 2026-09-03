"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Check, Cross, Refresh } from "@/components/icons";
import { byDue, readDue, type CanvasAssignment } from "@/lib/canvas";
import { fetchPendingAssignments, importAssignments } from "./actions";

/**
 * El importador — el mismo gesto que el lector de movimientos de My Pocket.
 *
 * Se va a buscar afuera, se muestra lo que vino, la persona marca lo que
 * quiere y recién ahí se escribe. Nada entra a la base sin que alguien lo
 * haya visto: importar automáticamente las treinta tareas del semestre sería
 * más rápido y mucho peor.
 */
export function Importer({
  followed,
  imported,
}: {
  /** Cuántos cursos se están siguiendo. Con cero no hay nada que buscar. */
  followed: number;
  /** Los `assignment_id` que ya están en la lista. */
  imported: number[];
}) {
  const [pending, setPending] = useState<CanvasAssignment[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [looking, startLooking] = useTransition();
  const [saving, startSaving] = useTransition();

  const already = new Set(imported);
  const now = new Date();

  function look() {
    setError(null);
    setDone(null);

    startLooking(async () => {
      const outcome = await fetchPendingAssignments();

      if (outcome.status !== "ready") {
        setError(
          outcome.status === "error" ? outcome.error : "No se pudo consultar."
        );
        setPending(null);
        return;
      }

      const rows = [...outcome.pending].sort(byDue);
      setPending(rows);
      // Lo que todavía no está en la lista viene marcado: es lo que la
      // persona vino a buscar. Lo que ya importó, no.
      setChosen(
        new Set(
          rows
            .filter((row) => !already.has(row.assignment_id))
            .map((row) => row.assignment_id)
        )
      );
    });
  }

  function save() {
    if (!pending) return;
    setError(null);

    const rows = pending.filter((row) => chosen.has(row.assignment_id));

    startSaving(async () => {
      const outcome = await importAssignments(rows);

      if (outcome.status !== "done") {
        setError(
          outcome.status === "error" ? outcome.error : "No se pudo importar."
        );
        return;
      }

      setDone(outcome.imported);
      setPending(null);
      setChosen(new Set());
    });
  }

  function toggle(id: number) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (followed === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={look}
          disabled={looking || saving}
          className="s-pill"
        >
          <Refresh className="size-[1.0625rem]" />
          {looking ? "Buscando…" : "Traer de Canvas"}
        </button>

        {pending ? (
          <button
            type="button"
            onClick={() => {
              setPending(null);
              setError(null);
            }}
            className="s-link"
          >
            Cancelar
          </button>
        ) : null}
      </div>

      {looking ? <div className="s-thinking mt-5" /> : null}

      {done != null ? (
        <p className="s-body mt-4 flex items-center gap-2 text-[var(--s-done)]">
          <Check className="size-4" />
          {done === 1
            ? "Una tarea importada, con su recordatorio."
            : `${done} tareas importadas, cada una con su recordatorio.`}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="s-body mt-4 text-[var(--s-late)]">
          {error}
        </p>
      ) : null}

      {pending ? (
        pending.length === 0 ? (
          <p className="s-body mt-6">
            Canvas no tiene nada sin entregar en esos cursos dentro de la
            ventana. Un buen lugar donde estar.
          </p>
        ) : (
          <div className="mt-7">
            <p className="s-eyebrow">
              {pending.length} sin entregar
            </p>

            <ul className="mt-3 flex flex-col">
              {pending.map((row, index) => {
                const on = chosen.has(row.assignment_id);
                const seen = already.has(row.assignment_id);
                const due = readDue(row.due_at, now);

                return (
                  <li
                    key={row.assignment_id}
                    className="s-rise border-b border-[var(--s-hair)]"
                    style={{ "--d": `${index * 45}ms` } as CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(row.assignment_id)}
                      aria-pressed={on}
                      className="flex w-full items-start gap-4 py-4 text-left"
                    >
                      <span className="s-check mt-0.5" data-on={on}>
                        <Check className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="s-caption block truncate">
                          {row.course_name}
                        </span>
                        <span className="mt-1 block text-[1rem] leading-tight font-medium">
                          {row.title}
                        </span>
                        <span className="s-caption mt-1.5 block">
                          {due.label}
                          {seen ? " · ya está en tu lista" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || chosen.size === 0}
                className="s-pill"
              >
                {saving
                  ? "Importando…"
                  : chosen.size === 0
                    ? "Elegí alguna"
                    : `Importar ${chosen.size}`}
              </button>

              {chosen.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setChosen(new Set())}
                  className="s-link"
                >
                  <Cross className="size-3.5" />
                  Ninguna
                </button>
              ) : null}
            </div>

            {saving ? <div className="s-thinking mt-5" /> : null}
          </div>
        )
      ) : null}
    </section>
  );
}
