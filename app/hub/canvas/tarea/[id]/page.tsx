import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack, ArrowUpRight } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { longDue, readDue, type DueTone } from "@/lib/canvas";
import { isDraftConfigured } from "@/lib/ai/draft";
import {
  CANVAS_PATH,
  canvasClient,
  loadAssignment,
  loadDrafts,
  loadMaterial,
  loadOpenTaskIds,
} from "../../data";
import { DraftCard } from "./draft-card";
import { MaterialList } from "./material-list";
import { DraftStudio } from "./draft-studio";
import { RemoveTask } from "./remove-task";

export const metadata: Metadata = {
  title: "Tarea · Canvas Studio",
};

const TONE_INK: Record<DueTone, string> = {
  overdue: "var(--s-late)",
  today: "var(--s-late)",
  soon: "var(--s-soon)",
  later: "var(--s-ink-3)",
  none: "var(--s-ink-3)",
};

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await canvasClient();

  const assignment = await loadAssignment(supabase, user.id, id);
  if (!assignment) notFound();

  const [drafts, material, openTasks] = await Promise.all([
    loadDrafts(supabase, assignment.id),
    loadMaterial(supabase, assignment.id),
    loadOpenTaskIds(
      supabase,
      user.id,
      assignment.task_id ? [assignment.task_id] : []
    ),
  ]);

  const due = readDue(assignment.due_at, new Date());
  const reminderAlive = Boolean(
    assignment.task_id && openTasks.has(assignment.task_id)
  );

  return (
    <main className="flex flex-1 flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <header
        className="s-rise flex items-center justify-between"
        style={{ "--d": "0ms" } as CSSProperties}
      >
        <NavLink
          href={CANVAS_PATH}
          className="s-link -ml-1 flex h-11 items-center gap-1 pr-2 pl-1"
        >
          <ArrowBack className="size-[1.0625rem]" />
          Lista
        </NavLink>
        <span className="s-tag" style={{ color: TONE_INK[due.tone] }}>
          {due.label}
        </span>
      </header>

      <section className="mt-9">
        <p
          className="s-eyebrow s-rise"
          style={{ "--d": "70ms" } as CSSProperties}
        >
          {assignment.course_name}
        </p>
        <h1
          className="s-title s-rise mt-3"
          style={{ "--d": "130ms" } as CSSProperties}
        >
          {assignment.title}
        </h1>
        <p
          className="s-body s-rise mt-4"
          style={{ "--d": "190ms" } as CSSProperties}
        >
          {longDue(assignment.due_at)}
          {assignment.points != null ? ` · ${assignment.points} puntos` : ""}
          {reminderAlive ? " · con recordatorio en Clean Daily" : ""}
        </p>

        {assignment.html_url ? (
          <a
            href={assignment.html_url}
            target="_blank"
            rel="noreferrer noopener"
            className="s-link s-rise mt-4"
            style={{ "--d": "240ms" } as CSSProperties}
          >
            Abrir en Canvas
            <ArrowUpRight className="size-4" />
          </a>
        ) : null}
      </section>

      {assignment.instructions ? (
        <section
          className="s-card s-rise mt-9 p-6"
          style={{ "--d": "300ms" } as CSSProperties}
        >
          <h2 className="s-eyebrow">El enunciado</h2>
          {/*
            Tal como vino de Canvas, sin HTML y sin resumir. Es el texto que
            después lee la IA: mostrar una versión distinta de la que se le
            manda sería mentirle a quien revisa.
          */}
          <p className="s-body mt-4 whitespace-pre-line text-[var(--s-ink)]">
            {assignment.instructions}
          </p>
        </section>
      ) : null}

      {/*
        El material va antes del taller y no después: cuando alguien abre esto
        a las once de la noche, lo primero que necesita es la plantilla que el
        profesor adjuntó, no el botón de la IA.
      */}
      <div className="s-rise mt-12" style={{ "--d": "340ms" } as CSSProperties}>
        <MaterialList assignmentId={assignment.id} files={material} />
      </div>

      <div className="s-rise mt-14" style={{ "--d": "400ms" } as CSSProperties}>
        <DraftStudio
          assignmentId={assignment.id}
          configured={isDraftConfigured()}
          material={material
            .filter(
              (file) =>
                file.kind === "file" &&
                file.status === "ready" &&
                (file.convertible || (file.mime ?? "").match(/^image\/|pdf/))
            )
            .map((file) => ({
              id: file.id,
              name: file.name,
              hint: (file.mime ?? "").includes("pdf")
                ? "PDF"
                : (file.mime ?? "").startsWith("image/")
                  ? "Imagen"
                  : "Texto",
            }))}
        />
      </div>

      {drafts.length > 0 ? (
        <section className="mt-14">
          <h2 className="s-eyebrow">
            {drafts.length === 1 ? "Tu borrador" : `Tus ${drafts.length} borradores`}
          </h2>

          <div className="mt-5 flex flex-col gap-4">
            {drafts.map((draft, index) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                title={assignment.title}
                open={index === 0}
                delay={index * 70}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-16 border-t border-[var(--s-hair)] pt-6">
        <RemoveTask id={assignment.id} hasReminder={reminderAlive} />
      </div>
    </main>
  );
}
