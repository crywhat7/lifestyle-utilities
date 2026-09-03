import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack, Cap, Chevron, Sliders } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { byDue, readDue, schoolLabel, type DueTone } from "@/lib/canvas";
import {
  LINK_PATH,
  TASK_PATH,
  canvasClient,
  loadAssignments,
  loadConnection,
  loadCourses,
} from "./data";
import { Importer } from "./importer";

export const metadata: Metadata = {
  title: "Canvas Studio",
  description: "Tus entregas de Canvas, en la mano y ya empezadas.",
};

/** El color de lo que falta. El azul no se usa: el azul es para tocar. */
const TONE_INK: Record<DueTone, string> = {
  overdue: "var(--s-late)",
  today: "var(--s-late)",
  soon: "var(--s-soon)",
  later: "var(--s-ink-3)",
  none: "var(--s-ink-3)",
};

export default async function CanvasPage() {
  const { supabase, user } = await canvasClient();

  const [connection, courses, assignments] = await Promise.all([
    loadConnection(supabase, user.id),
    loadCourses(supabase, user.id),
    loadAssignments(supabase, user.id),
  ]);

  const now = new Date();
  const followed = courses.filter((course) => course.followed);
  const sorted = [...assignments].sort(byDue);
  const late = sorted.filter(
    (row) => readDue(row.due_at, now).tone === "overdue"
  ).length;

  // El titular dice UNA cosa. Cuál, depende de dónde está parada la persona:
  // sin conexión, el paso que falta; con tareas, cuántas y qué tan cerca.
  const nearest = sorted.find((row) => row.due_at);
  const nearestRead = nearest ? readDue(nearest.due_at, now) : null;

  return (
    <main className="flex flex-1 flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <header
        className="s-rise flex items-center justify-between"
        style={{ "--d": "0ms" } as CSSProperties}
      >
        <NavLink
          href="/hub"
          className="s-link -ml-1 flex h-11 items-center gap-1 pr-2 pl-1"
        >
          <ArrowBack className="size-[1.0625rem]" />
          Hub
        </NavLink>

        <NavLink
          href={LINK_PATH}
          aria-label="Conexión y cursos"
          className="flex size-11 items-center justify-center rounded-full text-[var(--s-ink-2)]"
        >
          <Sliders className="size-[1.1875rem]" />
        </NavLink>
      </header>

      {/*
        El momento firma: un número enorme y una sola frase debajo. Es la
        pantalla de un keynote — nada compite con el dato, y el dato es el
        que hace levantar la vista del teléfono.
      */}
      <section className="mt-10 mb-12">
        <p
          className="s-eyebrow s-rise"
          style={{ "--d": "70ms" } as CSSProperties}
        >
          {connection ? schoolLabel(connection.base_url) : "Canvas"}
        </p>

        {connection ? (
          <>
            <h1
              className="s-hero s-rise mt-3"
              style={{ "--d": "140ms" } as CSSProperties}
            >
              {sorted.length === 0 ? (
                "Nada\npendiente."
              ) : (
                <>
                  {sorted.length}
                  <span className="text-[var(--s-ink-3)]">
                    {sorted.length === 1 ? " entrega" : " entregas"}
                  </span>
                </>
              )}
            </h1>

            <p
              className="s-body s-rise mt-5 max-w-[22rem]"
              style={{ "--d": "220ms" } as CSSProperties}
            >
              {sorted.length === 0
                ? "Traé de Canvas lo que tengas sin entregar y aparece acá, con su recordatorio en Clean Daily."
                : late > 0
                  ? `${late} ${late === 1 ? "está vencida" : "están vencidas"}. ${
                      nearestRead ? `La más cercana: ${nearestRead.label.toLowerCase()}.` : ""
                    }`
                  : nearestRead
                    ? `La más cercana ${nearestRead.label.toLowerCase()}. Tocá una para empezarla.`
                    : "Ninguna tiene fecha de entrega."}
            </p>
          </>
        ) : (
          <>
            <h1
              className="s-hero s-rise mt-3"
              style={{ "--d": "140ms" } as CSSProperties}
            >
              Tus tareas,
              <br />
              <span className="text-[var(--s-ink-3)]">acá.</span>
            </h1>
            <p
              className="s-body s-rise mt-5 max-w-[22rem]"
              style={{ "--d": "220ms" } as CSSProperties}
            >
              Conectá tu Canvas con una llave de acceso y traé lo que tengas
              sin entregar. Cada tarea llega con su enunciado, su recordatorio
              y un borrador que podés generar desde el teléfono.
            </p>
            <NavLink
              href={LINK_PATH}
              className="s-pill s-rise mt-8"
              style={{ "--d": "300ms" } as CSSProperties}
            >
              Conectar Canvas
            </NavLink>
          </>
        )}
      </section>

      {connection ? (
        <div className="s-rise" style={{ "--d": "320ms" } as CSSProperties}>
          <Importer
            followed={followed.length}
            imported={assignments.map((row) => row.assignment_id)}
          />
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <section className="mt-14">
          <h2
            className="s-eyebrow s-rise"
            style={{ "--d": "380ms" } as CSSProperties}
          >
            Tu lista
          </h2>

          <ul className="mt-4 flex flex-col">
            {sorted.map((row, index) => {
              const due = readDue(row.due_at, now);

              return (
                <li key={row.id}>
                  <NavLink
                    href={`${TASK_PATH}/${row.id}`}
                    className="s-rise flex items-center gap-4 border-b border-[var(--s-hair)] py-5"
                    style={
                      { "--d": `${420 + index * 60}ms` } as CSSProperties
                    }
                  >
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
                    <Chevron className="size-4 shrink-0 -rotate-90 text-[var(--s-ink-3)]" />
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {connection && followed.length === 0 ? (
        <section className="s-card mt-10 p-6">
          <Cap className="size-6 text-[var(--s-ink-3)]" />
          <h2 className="s-head mt-4">Elegí qué cursos seguir</h2>
          <p className="s-body mt-2">
            Canvas te tiene en varios y no todos importan. Los que prendas son
            los únicos que se miran.
          </p>
          <NavLink href={LINK_PATH} className="s-link mt-4">
            Ver mis cursos
            <Chevron className="size-3.5 -rotate-90" />
          </NavLink>
        </section>
      ) : null}

      <footer className="mt-auto pt-16">
        <p className="s-caption">
          {connection
            ? `Conectado como ${connection.account_name ?? "vos"} · ventana de ${connection.weeks} semanas`
            : "Sin conexión"}
        </p>
      </footer>
    </main>
  );
}
