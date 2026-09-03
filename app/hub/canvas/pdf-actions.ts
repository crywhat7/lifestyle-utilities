"use server";

import { revalidatePath } from "next/cache";
import {
  extractText,
  isConvertible,
  textToPdf,
  UNSUPPORTED_MESSAGE,
} from "@/lib/office";
import { draftSourceUrl } from "@/lib/canvas";
import { compileLatex } from "@/lib/tex";
import { TASK_PATH, canvasClient } from "./data";
import { BUCKET, safeName } from "./material";

export type ConvertState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; error: string };

/** Sufijo que distingue al PDF de su original en la clave única. */
const PDF_MARK = "#pdf";

/**
 * Convierte un documento del material a PDF y lo deja al lado del original.
 *
 * El PDF es una fila más, no un reemplazo: el .docx original sigue siendo la
 * plantilla que hay que entregar, y lo que se convierte es una copia para
 * poder leerla en el teléfono —y para poder mandársela a la IA, que no sabe
 * abrir Word—.
 *
 * Lo que sale es el texto y las tablas, paginados. No es una copia fiel del
 * diseño y la pantalla lo dice: prometer un facsímil y entregar otra cosa
 * sería peor que no ofrecer el botón.
 */
export async function convertFileToPdf(fileId: string): Promise<ConvertState> {
  const { supabase, user } = await canvasClient();

  const { data } = await supabase
    .from("canvas_files")
    .select("id,assignment_id,name,mime,storage_path,source_url")
    .eq("user_id", user.id)
    .eq("id", fileId)
    .maybeSingle();

  const file = data as {
    id: string;
    assignment_id: string;
    name: string;
    mime: string | null;
    storage_path: string | null;
    source_url: string;
  } | null;

  if (!file?.storage_path) {
    return { status: "error", error: "Ese archivo no está guardado acá." };
  }

  if (!isConvertible(file.name, file.mime)) {
    return { status: "error", error: UNSUPPORTED_MESSAGE };
  }

  const download = await supabase.storage.from(BUCKET).download(file.storage_path);

  if (download.error || !download.data) {
    return { status: "error", error: "No se pudo leer el archivo guardado." };
  }

  const bytes = Buffer.from(await download.data.arrayBuffer());
  const extracted = await extractText(bytes, file.name, file.mime);

  if (!extracted) {
    return {
      status: "error",
      error: "No se pudo leer el contenido del documento.",
    };
  }

  if (!extracted.text.trim()) {
    return {
      status: "error",
      error: "El documento no tiene texto: son imágenes o está vacío.",
    };
  }

  const base = file.name.replace(/\.[a-z0-9]{1,6}$/i, "");
  const name = `${base}.pdf`;

  const pdf = await textToPdf({
    title: base,
    source: file.name,
    text: extracted.text,
    mono: extracted.mono,
  });

  const path = `${user.id}/${file.assignment_id}/${crypto.randomUUID()}-${safeName(name)}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(pdf), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) {
    return { status: "error", error: "No se pudo guardar el PDF." };
  }

  /*
    Convertir dos veces el mismo documento no acumula copias: la clave única
    (tarea, origen) pisa la fila anterior. Los bytes viejos sí quedan, así
    que se borran a mano antes de perder su ruta.
  */
  const { data: previous } = await supabase
    .from("canvas_files")
    .select("storage_path")
    .eq("assignment_id", file.assignment_id)
    .eq("source_url", `${file.source_url}${PDF_MARK}`)
    .maybeSingle();

  const stale = (previous as { storage_path: string | null } | null)?.storage_path;
  if (stale) await supabase.storage.from(BUCKET).remove([stale]);

  const { error } = await supabase.from("canvas_files").upsert(
    {
      user_id: user.id,
      assignment_id: file.assignment_id,
      kind: "file",
      status: "ready",
      name,
      source_url: `${file.source_url}${PDF_MARK}`,
      mime: "application/pdf",
      bytes: pdf.byteLength,
      storage_path: path,
      error: null,
    },
    { onConflict: "assignment_id,source_url" }
  );

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { status: "error", error: "No se pudo guardar el PDF." };
  }

  revalidatePath(`${TASK_PATH}/[id]`, "page");
  return { status: "done" };
}

/* -------------------------------------------------------------------------- */
/* El borrador, compilado                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compila el LaTeX de un borrador y guarda el PDF junto a la tarea.
 *
 * Queda guardado y no solo bajado: la gracia de esto es abrir el teléfono en
 * el bus y ver cómo quedó la fórmula, y para eso el archivo tiene que estar
 * ahí la próxima vez sin volver a compilar.
 *
 * Compilar de nuevo pisa la versión anterior del mismo borrador —es el mismo
 * documento, corregido— pero cada borrador tiene su PDF: los intentos siguen
 * siendo distintos entre sí.
 */
export async function compileDraft(draftId: string): Promise<ConvertState> {
  const { supabase, user } = await canvasClient();

  const { data } = await supabase
    .from("canvas_drafts")
    .select("id,assignment_id,latex")
    .eq("user_id", user.id)
    .eq("id", draftId)
    .maybeSingle();

  const draft = data as {
    id: string;
    assignment_id: string;
    latex: string | null;
  } | null;

  if (!draft?.latex) {
    return { status: "error", error: "Ese borrador no tiene documento." };
  }

  const { data: assignment } = await supabase
    .from("canvas_assignments")
    .select("title")
    .eq("user_id", user.id)
    .eq("id", draft.assignment_id)
    .maybeSingle();

  const title = (assignment as { title: string } | null)?.title ?? "Borrador";

  const outcome = await compileLatex(draft.latex);

  if (!outcome.ok) return { status: "error", error: outcome.error };

  const name = `${title.slice(0, 60)}.pdf`;
  const path = `${user.id}/${draft.assignment_id}/${crypto.randomUUID()}-${safeName(name)}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, outcome.pdf, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) {
    return { status: "error", error: "Compiló, pero no se pudo guardar el PDF." };
  }

  // Los bytes de la compilación anterior de ESTE borrador ya no los nombra
  // nadie: se borran antes de que la fila pierda su ruta.
  const { data: previous } = await supabase
    .from("canvas_files")
    .select("storage_path")
    .eq("assignment_id", draft.assignment_id)
    .eq("source_url", draftSourceUrl(draft.id))
    .maybeSingle();

  const stale = (previous as { storage_path: string | null } | null)?.storage_path;
  if (stale) await supabase.storage.from(BUCKET).remove([stale]);

  const { error } = await supabase.from("canvas_files").upsert(
    {
      user_id: user.id,
      assignment_id: draft.assignment_id,
      kind: "file",
      status: "ready",
      name,
      source_url: draftSourceUrl(draft.id),
      mime: "application/pdf",
      bytes: outcome.pdf.byteLength,
      storage_path: path,
      error: null,
    },
    { onConflict: "assignment_id,source_url" }
  );

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { status: "error", error: "Compiló, pero no se pudo guardar el PDF." };
  }

  revalidatePath(`${TASK_PATH}/[id]`, "page");
  return { status: "done" };
}
