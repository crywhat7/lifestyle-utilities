"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { Check, Cross, Refresh } from "@/components/icons";
import {
  DUE_FILTERS,
  SORTS,
  passesFilter,
  readDue,
  sortAssignments,
  type CanvasAssignment,
  type DueFilter,
  type SortKey,
} from "@/lib/canvas";
import { fetchPendingAssignments, importAssignments } from "./actions";

type ImportDone = {
  imported: number;
  material: { files: number; links: number; failed: number };
};

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
  const [filter, setFilter] = useState<DueFilter>("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportDone | null>(null);
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

      const rows = outcome.pending;
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

      setDone({ imported: outcome.imported, material: outcome.material });
      setPending(null);
      setChosen(new Set());
    });
  }

  /*
    La lista que se ve no es la lista que se guarda. Filtrar y ordenar son
    formas de mirar: lo marcado sobrevive al cambio de filtro, así que se
    puede marcar tres vencidas, cambiar a "sin fecha", marcar dos más e
    importar las cinco.
  */
  const view = useMemo(() => {
    if (!pending) return [];
    const stamp = new Date();
    return sortAssignments(
      pending.filter((row) => passesFilter(row, filter, stamp)),
      sort
    );
  }, [pending, filter, sort]);

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

      {done ? (
        <div className="mt-4">
          <p className="s-body flex items-center gap-2 text-[var(--s-done)]">
            <Check className="size-4" />
            {done.imported === 1
              ? "Una tarea importada, con su recordatorio."
              : `${done.imported} tareas importadas, cada una con su recordatorio.`}
          </p>
          <p className="s-caption mt-1.5">
            {done.material.files > 0 || done.material.links > 0
              ? [
                  done.material.files > 0
                    ? `${done.material.files} ${done.material.files === 1 ? "archivo bajado" : "archivos bajados"}`
                    : null,
                  done.material.links > 0
                    ? `${done.material.links} ${done.material.links === 1 ? "enlace guardado" : "enlaces guardados"}`
                    : null,
                  done.material.failed > 0
                    ? `${done.material.failed} sin bajar`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Sin material adjunto en los enunciados."}
          </p>
        </div>
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
              {view.length === pending.length
                ? `${pending.length} sin entregar`
                : `${view.length} de ${pending.length}`}
            </p>

            {/*
              Los filtros van en un riel que se desliza y no en un menú: son
              cinco y el que está puesto tiene que verse sin abrir nada. El
              riel sangra hasta el borde de la pantalla para que se note que
              hay más a la derecha.
            */}
            <div className="-mx-6 mt-4 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2">
                {DUE_FILTERS.map((option) => {
                  const on = option.value === filter;
                  const count = pending.filter((row) =>
                    passesFilter(row, option.value, new Date())
                  ).length;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilter(option.value)}
                      className="s-chip"
                      data-on={on}
                    >
                      {option.label}
                      <span className="opacity-55">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <label className="s-caption" htmlFor="sort">
                Ordenar por
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="s-select"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {view.length === 0 ? (
              <p className="s-body mt-6">
                Nada en este filtro. Probá con otro.
              </p>
            ) : null}

            <ul className="mt-3 flex flex-col">
              {view.map((row, index) => {
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
                  ? "Importando y bajando material…"
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
