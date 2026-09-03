import "server-only";
import { canvasFileId, extractLinks, type FoundLink } from "@/lib/canvas";
import {
  DOWNLOAD_MESSAGE,
  downloadFile,
  fetchAssignmentHtml,
  fetchFileMeta,
  type CanvasCreds,
} from "@/lib/canvas-api";
import type { createClient } from "@/lib/supabase/server";

/**
 * Bajar el material de una tarea y dejarlo guardado.
 *
 * La razón de existir de esto: el PDF del caso y la plantilla en Word viven
 * detrás de la sesión de Canvas, y cuando el semestre cierra —o el profesor
 * mueve el archivo— desaparecen. Una copia propia es la diferencia entre
 * "tengo la tarea" y "tengo la tarea y todo lo que hacía falta para hacerla".
 *
 * Lo que no es un archivo se guarda igual, como enlace: una página del curso
 * no se puede copiar, pero sí tenerla en la misma lista en vez de ir a
 * buscarla al enunciado cada vez.
 */

export const BUCKET = "canvas-files";

/** Techos por tarea. Un enunciado con veinte enlaces es un índice, no material. */
const MAX_LINKS = 12;
const MAX_DOWNLOADS = 8;

type Client = Awaited<ReturnType<typeof createClient>>;

export type HarvestCount = { files: number; links: number; failed: number };

/** Un nombre de objeto que sobreviva a cualquier sistema de archivos. */
export function safeName(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return clean || "archivo";
}

/**
 * El material de UNA tarea.
 *
 * Los enlaces se recorren en serie y no en paralelo a propósito: son
 * descargas de hasta doce megas cada una contra el servidor de la escuela, y
 * ocho al mismo tiempo es la forma más rápida de que Canvas empiece a
 * responder 429 a todo lo demás.
 *
 * Nada de esto puede tumbar una importación: cada archivo que falla se anota
 * con su motivo y el siguiente sigue. Que una tarea entre sin su plantilla es
 * un inconveniente; que no entre por culpa de la plantilla, un error.
 */
export async function harvestMaterial(
  supabase: Client,
  userId: string,
  creds: CanvasCreds,
  assignment: { id: string; assignment_id: number; course_id: number }
): Promise<HarvestCount> {
  const count: HarvestCount = { files: 0, links: 0, failed: 0 };

  const html = await fetchAssignmentHtml(
    creds,
    assignment.course_id,
    assignment.assignment_id
  );

  if (!html.ok) return count;

  const links = extractLinks(html.data, creds.baseUrl).slice(0, MAX_LINKS);
  if (links.length === 0) return count;

  // Lo que ya está bajado no se vuelve a bajar: reimportar una tarea para
  // actualizar su fecha no tiene por qué costar veinte megas de red.
  const { data: known } = await supabase
    .from("canvas_files")
    .select("source_url,status")
    .eq("assignment_id", assignment.id);

  const done = new Set(
    ((known ?? []) as { source_url: string; status: string }[])
      .filter((row) => row.status === "ready")
      .map((row) => row.source_url)
  );

  let downloads = 0;

  for (const link of links) {
    if (done.has(link.url)) continue;

    const row = await resolveLink(
      supabase,
      userId,
      creds,
      assignment.id,
      link,
      downloads < MAX_DOWNLOADS
    );

    if (row.kind === "file") {
      downloads++;
      if (row.status === "ready") count.files++;
      else count.failed++;
    } else {
      count.links++;
    }

    await supabase.from("canvas_files").upsert(
      { user_id: userId, assignment_id: assignment.id, ...row },
      { onConflict: "assignment_id,source_url" }
    );
  }

  return count;
}

type FileRow = {
  kind: "file" | "link";
  status: "ready" | "failed";
  name: string;
  source_url: string;
  mime: string | null;
  bytes: number | null;
  storage_path: string | null;
  error: string | null;
};

/** Un enlace, resuelto a la fila que le corresponde. */
async function resolveLink(
  supabase: Client,
  userId: string,
  creds: CanvasCreds,
  assignmentId: string,
  link: FoundLink,
  canDownload: boolean
): Promise<FileRow> {
  const asLink = (error: string | null = null): FileRow => ({
    kind: "link",
    status: "ready",
    name: link.label,
    source_url: link.url,
    mime: null,
    bytes: null,
    storage_path: null,
    error,
  });

  if (link.kind === "link") return asLink();
  if (!canDownload) return asLink("No se bajó: demasiados archivos en esta tarea.");

  let target = link.url;
  let name = link.label;
  let token: string | undefined;

  if (link.kind === "canvas") {
    const fileId = canvasFileId(link.url);
    if (!fileId) return asLink();

    const meta = await fetchFileMeta(creds, fileId);

    if (meta.ok) {
      target = meta.data.url;
      name = meta.data.name;
    } else {
      // Sin metadatos se intenta igual contra la ruta de descarga, que es lo
      // que funciona cuando la llave ve el curso pero no el archivo suelto.
      target = `${link.url.split("?")[0]}/download?download_frd=1`;
      token = creds.token;
    }
  }

  const file = await downloadFile(target, token);

  if (!file.ok) {
    // Lo que resultó ser una página se guarda como lo que es, sin error: no
    // falló nada, simplemente no era un archivo.
    if (file.kind === "not_a_file") return asLink();

    return {
      kind: "file",
      status: "failed",
      name: name.slice(0, 200),
      source_url: link.url,
      mime: null,
      bytes: null,
      storage_path: null,
      error: DOWNLOAD_MESSAGE[file.kind],
    };
  }

  const finalName = (file.data.name ?? name).slice(0, 200);
  const path = `${userId}/${assignmentId}/${crypto.randomUUID()}-${safeName(finalName)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.data.bytes, {
      contentType: file.data.mime,
      upsert: false,
    });

  if (error) {
    return {
      kind: "file",
      status: "failed",
      name: finalName,
      source_url: link.url,
      mime: file.data.mime,
      bytes: file.data.bytes.byteLength,
      storage_path: null,
      error: "No se pudo guardar. ¿Corriste la migración 0014?",
    };
  }

  return {
    kind: "file",
    status: "ready",
    name: finalName,
    source_url: link.url,
    mime: file.data.mime,
    bytes: file.data.bytes.byteLength,
    storage_path: path,
    error: null,
  };
}
