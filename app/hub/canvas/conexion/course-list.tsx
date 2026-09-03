"use client";

import { useOptimistic, useState, useTransition, type CSSProperties } from "react";
import { Check, Refresh } from "@/components/icons";
import type { CanvasCourse } from "@/lib/canvas";
import { syncCourses, toggleCourse } from "../actions";

/**
 * Qué cursos se miran.
 *
 * La marca cambia en el acto y la escritura va detrás: prender seis cursos
 * seguidos con un viaje al servidor entre cada uno se siente roto, aunque
 * cada viaje dure 200 ms.
 */
export function CourseList({
  courses,
  linked,
}: {
  courses: CanvasCourse[];
  linked: boolean;
}) {
  const [rows, setRows] = useOptimistic(
    courses,
    (current: CanvasCourse[], id: number) =>
      current.map((course) =>
        course.course_id === id
          ? { ...course, followed: !course.followed }
          : course
      )
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  if (!linked) return null;

  const followed = rows.filter((course) => course.followed).length;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="s-eyebrow">Tus cursos</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              setError(null);
              const outcome = await syncCourses();
              if (outcome.status === "error") setError(outcome.error ?? null);
            })
          }
          className="s-link text-[0.9375rem]"
        >
          <Refresh className="size-4" />
          {busy ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <p className="s-body mt-3">
        {rows.length === 0
          ? "Todavía no trajimos ningún curso. Tocá actualizar."
          : followed === 0
            ? "Prendé los que estés cursando. Solo esos se miran."
            : `${followed} de ${rows.length} en seguimiento.`}
      </p>

      <ul className="mt-4 flex flex-col">
        {rows.map((course, index) => (
          <li
            key={course.course_id}
            className="s-rise border-b border-[var(--s-hair)]"
            style={{ "--d": `${index * 40}ms` } as CSSProperties}
          >
            <button
              type="button"
              aria-pressed={course.followed}
              onClick={() =>
                startBusy(async () => {
                  setRows(course.course_id);
                  await toggleCourse(course.course_id, !course.followed);
                })
              }
              className="flex w-full items-center gap-4 py-4 text-left"
            >
              <span className="s-check" data-on={course.followed}>
                <Check className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1rem] leading-tight font-medium">
                  {course.name}
                </span>
                <span className="s-caption mt-1 block truncate">
                  {[course.code, course.term].filter(Boolean).join(" · ") ||
                    "Sin ciclo"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="s-body mt-4 text-[var(--s-late)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
