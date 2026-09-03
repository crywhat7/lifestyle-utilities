"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Clip, Cross, Spark } from "@/components/icons";
import { generateDraftFor, type DraftState } from "../../draft-actions";

const INITIAL: DraftState = { status: "idle" };

/** Lo que el navegador debería ofrecer al abrir el selector. */
const ACCEPT = "image/*,application/pdf,.txt,.md,.csv,.tex,.json";

function weight(bytes: number) {
  return bytes < 1_000_000
    ? `${Math.round(bytes / 1000)} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * El taller: el enunciado ya está, esto es todo lo demás.
 *
 * Los archivos son la mitad del asunto. La foto del pizarrón, el PDF del
 * capítulo, el CSV de las mediciones del laboratorio: eso es lo que el
 * enunciado de Canvas nunca dice y sin lo cual la IA inventa. Van en el mismo
 * turno que las instrucciones, no en una conversación aparte.
 */
export type DraftSource = {
  id: string;
  name: string;
  /** "Word", "Excel", "PDF": qué va a leer la IA de ahí. */
  hint: string;
};

export function DraftStudio({
  assignmentId,
  configured,
  material,
}: {
  assignmentId: string;
  configured: boolean;
  /** El material ya bajado de Canvas, para mandarlo sin volver a subirlo. */
  material: DraftSource[];
}) {
  const [state, formAction, pending] = useActionState(
    generateDraftFor,
    INITIAL
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  /**
   * El `<input type="file">` no deja quitar UNO de los elegidos: su lista es
   * de solo lectura. Se reconstruye con un DataTransfer, que es la única
   * forma de que el formulario mande exactamente lo que se ve en pantalla.
   */
  function drop(index: number) {
    const next = files.filter((_, position) => position !== index);
    const transfer = new DataTransfer();
    next.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
    setFiles(next);
  }

  if (!configured) {
    return (
      <section className="s-card p-6">
        <h2 className="s-head">El borrador está apagado</h2>
        <p className="s-body mt-2">
          Falta la llave de Gemini en el servidor. El resto del módulo —traer
          tareas y crear recordatorios— funciona igual.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="s-title">
        Empezala
        <span className="text-[var(--s-ink-3)]"> ahora.</span>
      </h2>
      <p className="s-body mt-4 max-w-[23rem]">
        La IA lee el enunciado de arriba, lo que le agregues acá y los archivos
        que le des, y devuelve el documento en LaTeX listo para abrir en
        Overleaf y terminar.
      </p>

      <form action={formAction} className="mt-7 flex flex-col gap-5">
        <input type="hidden" name="assignment_id" value={assignmentId} />

        <div>
          <label className="s-field-label" htmlFor="extra_prompt">
            Qué querés que tenga en cuenta
          </label>
          <textarea
            id="extra_prompt"
            name="extra_prompt"
            rows={4}
            maxLength={4000}
            placeholder="Usá el método de la clase del martes. El profe pidió mínimo tres fuentes y conclusión aparte."
            className="s-field resize-none leading-[1.45]"
          />
          <p className="s-caption mt-2">
            Opcional, pero es lo que más cambia el resultado.
          </p>
        </div>

        {/*
          El material de la tarea ya está en el servidor: mandarlo es marcar
          una casilla. Obligar a bajar la plantilla al teléfono para volver a
          subirla acá sería pedirle a la persona que haga de cable.

          Word y Excel no los lee la IA, así que de esos viaja el texto que
          sacamos nosotros. Eso pasa solo, sin convertir nada a mano.
        */}
        {material.length > 0 ? (
          <div>
            <p className="s-field-label">Material de la tarea</p>
            <ul className="flex flex-col gap-1">
              {material.map((item) => {
                const on = chosen.has(item.id);

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChosen((current) => {
                          const next = new Set(current);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="s-check size-[1.375rem]" data-on={on}>
                        <Check className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
                        {item.name}
                      </span>
                      <span className="s-caption shrink-0">{item.hint}</span>
                    </button>
                    {on ? (
                      <input type="hidden" name="material" value={item.id} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div>
          <input
            ref={inputRef}
            id="files"
            name="files"
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []).slice(0, 6))
            }
            className="sr-only"
          />

          <label
            htmlFor="files"
            className="s-sheet flex cursor-pointer items-center gap-3 p-4"
          >
            <Clip className="size-5 shrink-0 text-[var(--s-blue)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[1rem] font-medium">
                Adjuntar contexto
              </span>
              <span className="s-caption mt-0.5 block">
                Fotos, PDFs o notas del teléfono. Hasta 6 archivos.
              </span>
            </span>
          </label>

          {files.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3"
                >
                  <span className="s-caption min-w-0 flex-1 truncate text-[var(--s-ink-2)]">
                    {file.name} · {weight(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => drop(index)}
                    aria-label={`Quitar ${file.name}`}
                    className="flex size-8 items-center justify-center rounded-full text-[var(--s-ink-3)]"
                  >
                    <Cross className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button type="submit" disabled={pending} className="s-pill w-full">
          <Spark className="size-[1.0625rem]" />
          {pending ? "Escribiendo…" : "Generar borrador"}
        </button>

        {pending ? (
          <>
            <div className="s-thinking" />
            <p className="s-caption text-center">
              Puede tardar hasta medio minuto. No cierres la pantalla.
            </p>
          </>
        ) : null}

        {state.status === "error" ? (
          <p role="alert" className="s-body text-[var(--s-late)]">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
