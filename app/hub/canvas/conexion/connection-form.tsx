"use client";

import { useActionState, useState } from "react";
import { Check } from "@/components/icons";
import {
  DEFAULT_WEEKS,
  MAX_WEEKS,
  MIN_WEEKS,
  type CanvasConnection,
} from "@/lib/canvas";
import { disconnect, saveConnection, type FormState } from "../actions";

const INITIAL: FormState = { status: "idle" };

/**
 * El formulario de la llave.
 *
 * Un solo campo importa y aun así es el que más miedo da: pegar un token
 * donde no se ve nada. Por eso las instrucciones están arriba del campo y no
 * escondidas en un "¿cómo consigo esto?" que hay que abrir.
 *
 * Con una conexión puesta, el campo llega vacío y eso significa "dejá la que
 * está": nadie va a copiar su token otra vez para cambiar las semanas.
 */
export function ConnectionForm({
  connection,
}: {
  connection: CanvasConnection | null;
}) {
  const [state, formAction, pending] = useActionState(saveConnection, INITIAL);
  const [dropping, setDropping] = useState(false);

  return (
    <section>
      <h2 className="s-eyebrow">La llave</h2>

      <ol className="s-body mt-4 flex list-none flex-col gap-2">
        <li>1. En Canvas, entrá a Cuenta → Configuración.</li>
        <li>2. Bajá hasta Acceso aprobado y tocá + Nuevo acceso.</li>
        <li>3. Ponele un nombre, dejá la fecha vacía y generá.</li>
        <li>4. Copiá el código largo: se muestra una sola vez.</li>
      </ol>

      <form action={formAction} className="mt-7 flex flex-col gap-5">
        <div>
          <label className="s-field-label" htmlFor="base_url">
            Dominio de tu Canvas
          </label>
          <input
            id="base_url"
            name="base_url"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            defaultValue={connection?.base_url ?? ""}
            placeholder="escuela.instructure.com"
            className="s-field"
          />
        </div>

        <div>
          <label className="s-field-label" htmlFor="access_token">
            Llave de acceso
          </label>
          <input
            id="access_token"
            name="access_token"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            required={!connection}
            placeholder={connection ? "Guardada · pegá una nueva para cambiarla" : "7~aB3…"}
            className="s-field"
          />
        </div>

        <div>
          <label className="s-field-label" htmlFor="weeks">
            Cuántas semanas hacia atrás
          </label>
          <input
            id="weeks"
            name="weeks"
            type="number"
            inputMode="numeric"
            min={MIN_WEEKS}
            max={MAX_WEEKS}
            step={1}
            defaultValue={connection?.weeks ?? DEFAULT_WEEKS}
            className="s-field"
          />
          <p className="s-caption mt-2">
            Lo que venció antes de esa ventana no aparece. Diez semanas es un
            ciclo de trabajo real.
          </p>
        </div>

        <button type="submit" disabled={pending} className="s-pill mt-1 w-full">
          {pending
            ? "Probando con Canvas…"
            : connection
              ? "Guardar cambios"
              : "Conectar"}
        </button>

        {pending ? <div className="s-thinking" /> : null}

        {state.status === "saved" ? (
          <p className="s-body flex items-center gap-2 text-[var(--s-done)]">
            <Check className="size-4" />
            Conectado. Abajo están tus cursos.
          </p>
        ) : null}

        {state.status === "error" ? (
          <p role="alert" className="s-body text-[var(--s-late)]">
            {state.error}
          </p>
        ) : null}
      </form>

      {connection ? (
        <div className="mt-8 border-t border-[var(--s-hair)] pt-6">
          {dropping ? (
            <div className="flex flex-col gap-3">
              <p className="s-body">
                Se borra la llave y la lista de cursos. Tus tareas importadas y
                sus borradores se quedan.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="s-pill"
                  style={{ backgroundColor: "var(--s-late)" }}
                >
                  Desconectar
                </button>
                <button
                  type="button"
                  onClick={() => setDropping(false)}
                  className="s-link"
                >
                  Mejor no
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDropping(true)}
              className="s-link"
              style={{ color: "var(--s-late)" }}
            >
              Desconectar Canvas
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
