"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { ArrowUpRight, Check, Chevron, Copy, Download, Trash } from "@/components/icons";
import type { CanvasDraft } from "@/lib/canvas";
import { saveBlob, saveFile } from "@/lib/save-file";
import { deleteDraft } from "../../draft-actions";
import { compileDraft } from "../../pdf-actions";

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
export type DraftPdf = {
  name: string;
  /** Para verlo dentro de la app. */
  href: string | null;
  /** Para guardarlo en el teléfono. */
  downloadHref: string | null;
};

export function DraftCard({
  draft,
  title,
  pdf,
  open: initiallyOpen,
  delay,
}: {
  draft: CanvasDraft;
  title: string;
  /** El PDF ya compilado de ESTE borrador, si alguna vez se compiló. */
  pdf: DraftPdf | null;
  open: boolean;
  delay: number;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [showPdf, setShowPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  /**
   * Compilar de verdad: el LaTeX sale a texlive.net —el compilador público
   * que usa TeX StackExchange— y vuelve el PDF tipografiado, con la
   * matemática como debe verse. No pasa solo: pasa cuando se toca el botón,
   * y el botón dice a dónde va el documento.
   */
  function compile() {
    setError(null);

    startPending(async () => {
      const outcome = await compileDraft(draft.id);

      if (outcome.status === "error") setError(outcome.error);
      else setShowPdf(true);
    });
  }

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

  /**
   * Instalada en el teléfono, un ancla con `download` no baja nada: iOS abre
   * Safari y lo cierra. `saveBlob` ofrece ahí la hoja de compartir, que sí
   * guarda en Archivos, y en escritorio hace la descarga de siempre.
   */
  function download() {
    if (!draft.latex) return;

    const blob = new Blob([draft.latex], {
      type: "application/x-tex;charset=utf-8",
    });

    void saveBlob(blob, fileName(title));
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

      {/*
        El PDF, adentro. Un `object` y no un enlace: la gracia de compilar
        desde el teléfono es ver cómo quedó la fórmula sin salir de acá.
      */}
      {showPdf && pdf?.href ? (
        <object
          data={pdf.href}
          type="application/pdf"
          aria-label={`Vista del PDF de ${title}`}
          className="block h-[70vh] w-full border-t border-[var(--s-hair)] bg-[var(--s-surface)]"
        >
          <p className="s-body p-5">
            Este navegador no muestra PDFs acá adentro. Guardalo y abrilo con
            el visor del teléfono.
          </p>
        </object>
      ) : null}

      {open && draft.latex ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--s-hair)] p-3">
          {/*
            Overleaf recibe el documento por POST y abre un proyecto nuevo ya
            compilado. Es el mejor visor de LaTeX que existe y no hay que
            pedirle permiso a nadie: es su propia forma de integrarse.
          */}
          <form
            action="https://www.overleaf.com/docs"
            method="post"
            target="_blank"
            rel="noreferrer noopener"
            className="flex-1"
          >
            <input type="hidden" name="snip" value={draft.latex} />
            <input
              type="hidden"
              name="snip_name"
              value={`${title.slice(0, 60)}.tex`}
            />
            <input type="hidden" name="engine" value="pdflatex" />
            <button
              type="submit"
              className="s-pill s-pill-ghost h-10 min-h-10 w-full text-[0.9375rem]"
            >
              <ArrowUpRight className="size-4" />
              Overleaf
            </button>
          </form>

          {pdf ? (
            <>
              <button
                type="button"
                onClick={() => setShowPdf((current) => !current)}
                className="s-pill s-pill-ghost h-10 min-h-10 flex-1 text-[0.9375rem]"
              >
                {showPdf ? "Ocultar PDF" : "Ver PDF"}
              </button>
              <button
                type="button"
                disabled={!pdf.downloadHref}
                onClick={() =>
                  pdf.downloadHref &&
                  void saveFile(pdf.downloadHref, pdf.name, "application/pdf")
                }
                className="s-pill h-10 min-h-10 flex-1 text-[0.9375rem]"
              >
                <Download className="size-4" />
                Guardar PDF
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={compile}
                className="s-link px-2 text-[0.8125rem]"
              >
                {pending ? "Compilando…" : "Recompilar"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={compile}
              className="s-pill h-10 min-h-10 flex-1 text-[0.9375rem] disabled:opacity-50"
            >
              {pending ? "Compilando…" : "Compilar PDF"}
            </button>
          )}
        </div>
      ) : null}

      {pending ? <div className="s-thinking mx-3 mb-3" /> : null}

      {error ? (
        <p role="alert" className="s-body px-5 pb-4 text-[var(--s-late)]">
          {error}
        </p>
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
