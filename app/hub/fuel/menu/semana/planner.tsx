"use client";

import { useRef, useState, useTransition, type CSSProperties } from "react";
import { Check, Cross, Download, PlusSlot, Share } from "@/components/icons";
import {
  COURSE_LABEL,
  COURSES,
  formatKcal,
  PLAN_DAYS,
  planDayKcal,
  type Course,
  type MenuItem,
  type PlanDay,
  type PlanSlots,
} from "@/lib/fuel";
import { saveBlob } from "@/lib/save-file";
import { clearWeek, fillWeek, setSlot, type SlotResult } from "../../actions";

type Picking = { day: PlanDay; course: Course } | null;

/**
 * La semana como una grilla de casilleros: seis días, cuatro tiempos, cada
 * casillero vacío o con UN plato. Tocar un casillero abre los platos de ese
 * tiempo en tu menú; elegir uno reemplaza al que estaba. Así la regla de "no
 * dos desayunos el mismo día" no hay que explicarla: no hay dónde ponerlo.
 *
 * Los cambios se ven al instante y se guardan detrás; si el servidor no
 * puede, la grilla vuelve a como estaba y lo dice.
 */
export function Planner({
  initial,
  items,
  target,
}: {
  initial: PlanSlots;
  items: MenuItem[];
  target: number | null;
}) {
  const [slots, setSlots] = useState<PlanSlots>(initial);
  const [picking, setPicking] = useState<Picking>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const sheet = useRef<HTMLDialogElement>(null);

  const filled = PLAN_DAYS.reduce(
    (sum, day) => sum + COURSES.filter((course) => slots[day.key]?.[course]).length,
    0
  );

  function apply(run: () => Promise<SlotResult>, optimistic?: PlanSlots) {
    const before = slots;
    if (optimistic) setSlots(optimistic);
    setError(null);

    start(async () => {
      try {
        const result = await run();
        if (result.ok) setSlots(result.slots);
        else {
          setSlots(before);
          setError(result.error);
        }
      } catch {
        setSlots(before);
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function open(day: PlanDay, course: Course) {
    setPicking({ day, course });
    sheet.current?.showModal();
  }

  function choose(index: number | null) {
    if (!picking) return;
    const { day, course } = picking;
    const next: PlanSlots = { ...slots, [day]: { ...(slots[day] ?? {}) } };
    if (index == null) delete next[day]![course];
    else next[day]![course] = items[index];

    sheet.current?.close();
    apply(() => setSlot(day, course, index), next);
  }

  const options = picking
    ? items.map((item, index) => ({ item, index })).filter(({ item }) => item.course === picking.course)
    : [];
  const current = picking ? slots[picking.day]?.[picking.course] : undefined;

  return (
    <>
      <div className="kindle flex gap-2" style={{ "--d": "140ms" } as CSSProperties}>
        <button
          type="button"
          disabled={busy}
          onClick={() => apply(fillWeek)}
          className="e-key flex h-11 flex-1 items-center justify-center gap-2 text-[0.8125rem]"
        >
          <PlusSlot className="size-3.5" />
          Rellenar vacíos
        </button>
        <button
          type="button"
          disabled={busy || filled === 0}
          onClick={() => apply(clearWeek, {})}
          className="e-key flex h-11 items-center justify-center gap-2 px-4 text-[0.8125rem]"
        >
          <Cross className="size-3" />
          Vaciar
        </button>
      </div>

      {error ? (
        <p role="alert" className="-mt-4 text-center text-[0.8125rem] text-[var(--e-over-ink)]">
          {error}
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {PLAN_DAYS.map((day, position) => {
          const kcal = planDayKcal(slots, day.key);
          const over = target != null && kcal > target * 1.05;
          return (
            <li
              key={day.key}
              className="e-card kindle overflow-hidden"
              style={{ "--d": `${200 + position * 60}ms` } as CSSProperties}
            >
              <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
                <h2 className="e-display text-[1.375rem]">{day.name}</h2>
                <span
                  className="text-[0.75rem] tabular-nums"
                  style={{ color: over ? "var(--e-over-ink)" : "var(--e-ink-3)" }}
                >
                  {kcal === 0
                    ? "sin platos"
                    : target
                      ? `${formatKcal(kcal)} de ${formatKcal(target)} kcal`
                      : `${formatKcal(kcal)} kcal`}
                </span>
              </div>

              <ul>
                {COURSES.map((course) => {
                  const item = slots[day.key]?.[course];
                  return (
                    <li key={course} className="border-t border-[var(--e-hair)]">
                      <button
                        type="button"
                        onClick={() => open(day.key, course)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left"
                        aria-label={`${day.name}, ${COURSE_LABEL[course].one}: ${item ? item.name : "vacío"}`}
                      >
                        <span className="e-eyebrow w-[5.5rem] shrink-0 tracking-[0.14em]">
                          {COURSE_LABEL[course].one}
                        </span>
                        {item ? (
                          <>
                            <span className="min-w-0 flex-1 truncate text-[0.875rem]">{item.name}</span>
                            <span className="shrink-0 text-[0.75rem] text-[var(--e-ink-3)] tabular-nums">
                              {formatKcal(item.kcal)}
                            </span>
                          </>
                        ) : (
                          <span className="flex-1 text-[0.8125rem] text-[var(--e-ink-3)]">
                            + elegir
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>

      <ExportBar filled={filled} />

      <dialog
        ref={sheet}
        className="e-sheet"
        aria-label="Elegir plato"
        onClose={() => setPicking(null)}
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current?.close();
        }}
      >
        <span aria-hidden="true" className="e-grip" />
        {picking ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="e-eyebrow">{PLAN_DAYS.find((day) => day.key === picking.day)?.name}</p>
                <h2 className="e-display mt-2 text-[1.875rem]">{COURSE_LABEL[picking.course].one}</h2>
              </div>
              <button
                type="button"
                onClick={() => sheet.current?.close()}
                aria-label="Cerrar"
                className="e-key flex size-10 shrink-0 items-center justify-center"
              >
                <Cross className="size-3.5" />
              </button>
            </div>

            <ul className="e-card overflow-hidden">
              {options.map(({ item, index }, row) => {
                const on = current?.name === item.name;
                return (
                  <li key={index} className={row > 0 ? "border-t border-[var(--e-hair)]" : ""}>
                    <button
                      type="button"
                      onClick={() => choose(index)}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                      data-on={on}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="e-display block text-[1.125rem] leading-tight">{item.name}</span>
                        <span className="mt-1 block text-[0.75rem] leading-snug text-[var(--e-ink-3)]">
                          {item.ingredients.slice(0, 5).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[0.8125rem] tabular-nums">{formatKcal(item.kcal)}</span>
                      {on ? <Check className="mt-1 size-4 shrink-0 text-[var(--e-ink-hot)]" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {current ? (
              <button
                type="button"
                onClick={() => choose(null)}
                className="e-key flex h-12 items-center justify-center gap-2 text-[0.8125rem]"
              >
                <Cross className="size-3" />
                Dejar sin {COURSE_LABEL[picking.course].one.toLowerCase()}
              </button>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * Exportar y mandar.
 *
 * En el teléfono, el PDF sale directo a la hoja de compartir —WhatsApp,
 * correo— porque el punto es mandárselo a quien cocina, no guardarlo. Si el
 * navegador ya no deja compartir (la primera exportación puede tardar lo que
 * tarda la IA en escribir las recetas, y el permiso del toque vence), queda
 * un segundo botón que comparte el archivo ya listo con un toque nuevo.
 */
function ExportBar({ filled }: { filled: number }) {
  const [pending, start] = useTransition();
  const [ready, setReady] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function share(file: File) {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Menú de la semana" });
        setReady(null);
        return true;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return true;
        if (cause instanceof DOMException && cause.name === "NotAllowedError") return false;
      }
    }
    await saveBlob(file, file.name);
    setReady(null);
    return true;
  }

  function exportPdf() {
    setMessage(null);
    start(async () => {
      try {
        const response = await fetch("/hub/fuel/menu/semana/pdf", { cache: "no-store" });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setMessage(body?.error ?? "No se pudo armar el PDF.");
          return;
        }
        const blob = await response.blob();
        const file = new File([blob], "menu-de-la-semana.pdf", { type: "application/pdf" });
        const done = await share(file);
        if (!done) setReady(file);
      } catch {
        setMessage("Se cortó la conexión armando el PDF. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-5 flex flex-col gap-2 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] [background:linear-gradient(transparent,var(--e-ground)_30%)]">
      {message ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--e-over-ink)]">
          {message}
        </p>
      ) : null}
      {ready ? (
        <button
          type="button"
          onClick={() => void share(ready)}
          className="e-key e-key-lit flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
        >
          <Share className="size-4" />
          El PDF está listo: compartir
        </button>
      ) : (
        <button
          type="button"
          disabled={pending || filled === 0}
          onClick={exportPdf}
          className="e-key e-key-lit flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
        >
          <Download className="size-4" />
          {pending ? "Escribiendo las recetas…" : filled === 0 ? "Elegí algún plato para exportar" : "Exportar PDF"}
        </button>
      )}
      {pending ? (
        <p className="text-center text-[0.75rem] text-[var(--e-ink-3)]">
          La primera vez la IA redacta cada preparación; puede tardar medio minuto.
        </p>
      ) : null}
    </div>
  );
}
