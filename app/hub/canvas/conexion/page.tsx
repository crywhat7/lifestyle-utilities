import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowBack } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { schoolLabel } from "@/lib/canvas";
import { CANVAS_PATH, canvasClient, loadConnection, loadCourses } from "../data";
import { ConnectionForm } from "./connection-form";
import { CourseList } from "./course-list";

export const metadata: Metadata = {
  title: "Conexión · Canvas Studio",
  description: "Tu llave de acceso, la ventana de semanas y qué cursos seguir.",
};

export default async function CanvasLinkPage() {
  const { supabase, user } = await canvasClient();

  const [connection, courses] = await Promise.all([
    loadConnection(supabase, user.id),
    loadCourses(supabase, user.id),
  ]);

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
          Studio
        </NavLink>
        <span className="s-eyebrow">Conexión</span>
      </header>

      <section className="mt-10 mb-12">
        <h1
          className="s-title s-rise"
          style={{ "--d": "70ms" } as CSSProperties}
        >
          {connection ? (
            <>
              Conectado a
              <br />
              <span className="text-[var(--s-ink-3)]">
                {schoolLabel(connection.base_url)}
              </span>
            </>
          ) : (
            <>
              Una llave,
              <br />
              <span className="text-[var(--s-ink-3)]">y listo.</span>
            </>
          )}
        </h1>

        <p
          className="s-body s-rise mt-5 max-w-[23rem]"
          style={{ "--d": "140ms" } as CSSProperties}
        >
          {connection
            ? `Canvas responde como ${connection.account_name ?? "tu cuenta"}. La llave se guarda cifrada en tránsito y nunca vuelve a esta pantalla.`
            : "La llave se genera en Canvas y solo la usa este servidor para preguntar por tus cursos y tus entregas. Nunca escribe nada en Canvas."}
        </p>
      </section>

      <div className="s-rise" style={{ "--d": "220ms" } as CSSProperties}>
        <ConnectionForm connection={connection} />
      </div>

      <div className="s-rise mt-14" style={{ "--d": "300ms" } as CSSProperties}>
        <CourseList courses={courses} linked={Boolean(connection)} />
      </div>
    </main>
  );
}
