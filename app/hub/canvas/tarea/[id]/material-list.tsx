"use client";

import { useState, useTransition } from "react";
import { Clip, Cross, Download, Refresh } from "@/components/icons";
import { weightLabel } from "@/lib/canvas";
import type { MaterialFile } from "../../data";
import { deleteFile, refreshMaterial } from "../../actions";

/** Tres letras que dicen qué es sin abrirlo: PDF, DOCX, XLSX. */
function badge(file: MaterialFile) {
  const fromName = file.name.match(/\.([a-z0-9]{1,5})(?:$|\?)/i);
  if (fromName) return fromName[1].toUpperCase().slice(0, 4);

  const mime = file.mime ?? "";
  if (mime.startsWith("image/")) return "IMG";
  if (mime.includes("pdf")) return "PDF";
  return "DOC";
}

/**
 * El material de la tarea: lo que ya es tuyo y lo que sigue siendo de Canvas.
 *
 * Los archivos se bajaron al importar y se abren desde acá aunque el semestre
 * haya cerrado. Los enlaces son lo que no se pudo copiar —una página, un
 * Drive que pide sesión— y se guardan igual para no tener que volver a
 * rastrear el enunciado.
 */
export function MaterialList({
  assignmentId,
  files,
}: {
  assignmentId: string;
  files: MaterialFile[];
}) {
  const [busy, startBusy] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const saved = files.filter((file) => file.kind === "file");
  const links = files.filter((file) => file.kind === "link");
  const failed = saved.filter((file) => file.status === "failed");

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="s-eyebrow">Material</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              setNote(null);
              const outcome = await refreshMaterial(assignmentId);

              if (outcome.status !== "done") {
                setNote(
                  outcome.status === "error"
                    ? outcome.error
                    : "No se pudo buscar el material."
                );
                return;
              }

              const { files: got, links: kept, failed: lost } = outcome.material;
              setNote(
                got + kept === 0
                  ? "No había nada nuevo que bajar."
                  : `${got} ${got === 1 ? "archivo" : "archivos"} · ${kept} ${kept === 1 ? "enlace" : "enlaces"}${lost ? ` · ${lost} sin bajar` : ""}`
              );
            })
          }
          className="s-link text-[0.9375rem]"
        >
          <Refresh className="size-4" />
          {busy ? "Buscando…" : failed.length > 0 ? "Reintentar" : "Buscar"}
        </button>
      </div>

      {files.length === 0 ? (
        <p className="s-body mt-3">
          El enunciado no traía archivos ni enlaces. Si el profesor sube algo
          después, tocá buscar.
        </p>
      ) : (
        <p className="s-body mt-3">
          {saved.filter((file) => file.status === "ready").length > 0
            ? "Guardado acá: se abre aunque Canvas cierre el semestre."
            : "Los enlaces del enunciado, a mano."}
        </p>
      )}

      {busy ? <div className="s-thinking mt-4" /> : null}

      {note ? <p className="s-caption mt-3">{note}</p> : null}

      {files.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2">
          {[...saved, ...links].map((file) => (
            <li key={file.id} className="s-sheet flex items-center gap-3 p-3.5">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--s-surface)] text-[0.625rem] font-semibold tracking-tight text-[var(--s-ink-2)]"
                aria-hidden="true"
              >
                {file.kind === "link" ? <Clip className="size-4" /> : badge(file)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">
                  {file.name}
                </span>
                <span className="s-caption mt-0.5 block truncate">
                  {file.status === "failed"
                    ? file.error
                    : file.kind === "link"
                      ? new URL(file.source_url).hostname
                      : [weightLabel(file.bytes), "guardado"]
                          .filter(Boolean)
                          .join(" · ")}
                </span>
              </span>

              {file.href ? (
                <a
                  href={file.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Abrir ${file.name}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--s-blue)]"
                >
                  <Download className="size-[1.125rem]" />
                </a>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => startBusy(async () => { await deleteFile(file.id); })}
                aria-label={`Quitar ${file.name}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--s-ink-3)] disabled:opacity-40"
              >
                <Cross className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
