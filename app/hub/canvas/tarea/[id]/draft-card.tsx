"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Check, Chevron, Copy, Download, Trash } from "@/components/icons";
import type { CanvasDraft } from "@/lib/canvas";
import { deleteDraft } from "../../draft-actions";

/** "3 de septiembre, 23:14" — cuándo se escribió este intento. */
function stamp(iso: string) {
  return new Date(iso).toLocaleString("es-GT", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Un nombre de archivo que sobreviva a cualquier sistema. */
function fileName(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return `${slug || "borrador"}.tex`;
}

/**
 * Un borrador, con las dos salidas que de verdad se usan.
 *
 * Copiar es para Overleaf en el teléfono; bajar el .tex es para la
 * computadora de la casa. Nada de "compartir": el destino de esto siempre es
 * un editor de LaTeX.
 */
export function DraftCard({
  draft,
  title,
  open: initiallyOpen,
  delay,
}: {
  draft: CanvasDraft;
  title: string;
  open: boolean;
  delay: number;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [copied, setCopied] = useState(false);
  const [pending, startPending] = useTransition();

  async function copy() {
    if (!draft.latex) return;

    try {
      await navigator.clipboard.writeText(draft.latex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Sin permiso de portapapeles queda el botón de bajar el archivo.
    }
  }

  function download() {
    if (!draft.latex) return;

    const blob = new Blob([draft.latex], {
      type: "application/x-tex;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName(title);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const failed = draft.status === "failed";

  return (
    <article
      className="s-sheet s-rise overflow-hidden"
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <div className="flex items-start gap-3 p-5">
        <span className="min-w-0 flex-1">
          <span className="s-caption block">{stamp(draft.created_at)}</span>
          <span className="mt-1 block text-[1rem] font-medium">
            {failed ? "No se pudo escribir" : "Borrador en LaTeX"}
          </span>
          <span className="s-caption mt-1 block truncate">
            {[draft.sources, draft.model].filter(Boolean).join(" · ") ||
              "Solo con el enunciado"}
          </span>
        </span>

        {!failed ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-label={open ? "Ocultar el código" : "Ver el código"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--s-ink-3)]"
          >
            <Chevron
              className={`size-4 transition-transform duration-500 [transition-timing-function:var(--s-ease)] ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        ) : null}
      </div>

      {failed ? (
        <p className="s-body px-5 pb-5 text-[var(--s-late)]">{draft.error}</p>
      ) : null}

      {open && draft.latex ? (
        <div className="border-t border-[var(--s-hair)] bg-[var(--s-surface)]">
          <pre className="s-code p-5">{draft.latex}</pre>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-[var(--s-hair)] p-3">
        {draft.latex ? (
          <>
            <button
              type="button"
              onClick={copy}
              className="s-pill s-pill-ghost h-10 min-h-10 flex-1 text-[0.9375rem]"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={download}
              className="s-pill s-pill-ghost h-10 min-h-10 flex-1 text-[0.9375rem]"
            >
              <Download className="size-4" />
              Bajar .tex
            </button>
          </>
        ) : (
          <span className="s-caption flex-1 px-2">Sin documento.</span>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => startPending(async () => { await deleteDraft(draft.id); })}
          aria-label="Borrar este intento"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--s-ink-3)] disabled:opacity-40"
        >
          <Trash className="size-4" />
        </button>
      </div>
    </article>
  );
}
