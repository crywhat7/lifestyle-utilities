"use server";

import { revalidatePath } from "next/cache";
import { generateDraft, DRAFT_MESSAGE, type DraftAttachment } from "@/lib/ai/draft";
import { longDue } from "@/lib/canvas";
import { extractText } from "@/lib/office";
import { CANVAS_PATH, TASK_PATH, canvasClient, loadAssignment } from "./data";
import { BUCKET } from "./material";

export type DraftState =
  | { status: "idle" }
  | { status: "done"; draftId: string }
  | { status: "error"; error: string };

/** Lo que aguanta una Server Action sin que el request se caiga por peso. */
const MAX_FILES = 6;
const MAX_TOTAL_BYTES = 12_000_000;
const MAX_ONE_BYTE = 6_000_000;

/** Lo que Gemini entiende de verdad. Todo lo demás se rechaza con nombre. */
const BINARY_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const TEXT_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/x-tex",
  "application/x-tex",
];

/** ".md" y ".tex" llegan con mime vacío desde varios navegadores. */
function looksLikeText(file: File) {
  return (
    TEXT_TYPES.includes(file.type) ||
    /\.(txt|md|csv|json|tex|bib)$/i.test(file.name)
  );
}

function looksLikeBinary(file: File) {
  return BINARY_TYPES.includes(file.type) || /\.(jpe?g|png|webp|pdf|heic)$/i.test(file.name);
}

/** "2 imágenes · 1 PDF · notas.md" — de dónde salió este borrador. */
function describeSources(files: DraftAttachment[]) {
  if (files.length === 0) return null;

  const images = files.filter((file) => file.mimeType.startsWith("image/")).length;
  const pdfs = files.filter((file) => file.mimeType === "application/pdf").length;
  const texts = files.filter((file) => file.text).length;

  const parts = [
    images ? `${images} ${images === 1 ? "imagen" : "imágenes"}` : null,
    pdfs ? `${pdfs} PDF` : null,
    texts ? `${texts} ${texts === 1 ? "archivo de texto" : "archivos de texto"}` : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

/**
 * Escribe el borrador de una tarea.
 *
 * Todo el contexto entra en un solo turno: las instrucciones que ya trajimos
 * de Canvas, lo que la persona escribe en el campo de abajo y los archivos
 * que adjunte —la foto del pizarrón, el PDF del capítulo, sus propias notas—.
 * Que sea un solo turno importa: el modelo ve el enunciado y la foto del
 * enunciado a la vez, y así deja de inventar lo que no puede leer.
 *
 * El resultado se guarda siempre, incluso cuando falla: saber que el intento
 * de las 11 de la noche se cayó por cuota es información, y borrarlo dejaría
 * a la persona pensando que nunca apretó el botón.
 */
export async function generateDraftFor(
  _prev: DraftState,
  formData: FormData
): Promise<DraftState> {
  const { supabase, user } = await canvasClient();

  const assignmentId = String(formData.get("assignment_id") ?? "");
  const assignment = await loadAssignment(supabase, user.id, assignmentId);

  if (!assignment) return { status: "error", error: "Esa tarea ya no está." };

  const extraPrompt = String(formData.get("extra_prompt") ?? "")
    .trim()
    .slice(0, 4_000);

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  // El material que ya bajamos de Canvas: se elige por id y se lee del
  // bucket. Que la persona tenga que descargar la plantilla al teléfono para
  // volver a subirla acá sería absurdo teniéndola nosotros.
  const materialIds = formData
    .getAll("material")
    .map((entry) => String(entry))
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, MAX_FILES);

  if (files.length > MAX_FILES) {
    return {
      status: "error",
      error: `Hasta ${MAX_FILES} archivos por borrador.`,
    };
  }

  let total = 0;
  const attachments: DraftAttachment[] = [];

  for (const file of files) {
    total += file.size;

    if (file.size > MAX_ONE_BYTE || total > MAX_TOTAL_BYTES) {
      return {
        status: "error",
        error: `"${file.name}" es demasiado pesado. Mandá menos de 6 MB por archivo.`,
      };
    }

    if (looksLikeText(file)) {
      attachments.push({
        name: file.name,
        mimeType: "text/plain",
        text: (await file.text()).slice(0, 20_000),
      });
      continue;
    }

    if (!looksLikeBinary(file)) {
      return {
        status: "error",
        error: `"${file.name}" no es una imagen, un PDF ni un archivo de texto.`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    attachments.push({
      name: file.name,
      // Un .heic sin mime declarado igual tiene que llegar con uno válido.
      mimeType: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "image/jpeg"),
      base64: buffer.toString("base64"),
    });
  }

  const fromMaterial = await readMaterial(supabase, user.id, assignment.id, materialIds);

  if (fromMaterial.error) {
    return { status: "error", error: fromMaterial.error };
  }

  attachments.push(...fromMaterial.attachments);

  const outcome = await generateDraft({
    title: assignment.title,
    courseName: assignment.course_name,
    dueLabel: longDue(assignment.due_at),
    points: assignment.points,
    instructions: assignment.instructions,
    extraPrompt,
    attachments,
  });

  const sources = describeSources(attachments);

  const { data, error } = await supabase
    .from("canvas_drafts")
    .insert({
      user_id: user.id,
      assignment_id: assignment.id,
      extra_prompt: extraPrompt || null,
      sources,
      latex: outcome.ok ? outcome.latex : null,
      model: outcome.ok ? outcome.model : null,
      status: outcome.ok ? "ready" : "failed",
      error: outcome.ok ? null : DRAFT_MESSAGE[outcome.kind],
    })
    .select("id")
    .maybeSingle();

  revalidatePath(`${TASK_PATH}/[id]`, "page");
  revalidatePath(CANVAS_PATH);

  if (!outcome.ok) {
    return { status: "error", error: DRAFT_MESSAGE[outcome.kind] };
  }

  if (error || !data) {
    return {
      status: "error",
      error: "La IA escribió el borrador pero no se pudo guardar.",
    };
  }

  return { status: "done", draftId: (data as { id: string }).id };
}

/** Un borrador que no sirvió no tiene por qué quedarse ocupando pantalla. */
export async function deleteDraft(draftId: string) {
  const { supabase, user } = await canvasClient();

  await supabase
    .from("canvas_drafts")
    .delete()
    .eq("user_id", user.id)
    .eq("id", draftId);

  revalidatePath(`${TASK_PATH}/[id]`, "page");
}

/* -------------------------------------------------------------------------- */
/* El material guardado, como contexto                                         */
/* -------------------------------------------------------------------------- */

type MaterialRow = {
  id: string;
  name: string;
  mime: string | null;
  storage_path: string | null;
};

/**
 * Los archivos del material elegidos, listos para el turno de la IA.
 *
 * Cada uno entra por la puerta que le corresponde: una foto o un PDF viajan
 * tal cual, porque Gemini los mira; un Word o un Excel no —el modelo no sabe
 * abrirlos— así que se les saca el texto acá y lo que viaja es eso. Es la
 * misma conversión del botón "PDF", usada sin pedirle nada a nadie.
 */
async function readMaterial(
  supabase: Awaited<ReturnType<typeof canvasClient>>["supabase"],
  userId: string,
  assignmentId: string,
  ids: string[]
): Promise<{ attachments: DraftAttachment[]; error?: string }> {
  if (ids.length === 0) return { attachments: [] };

  const { data } = await supabase
    .from("canvas_files")
    .select("id,name,mime,storage_path")
    .eq("user_id", userId)
    .eq("assignment_id", assignmentId)
    .eq("status", "ready")
    .in("id", ids);

  const rows = ((data ?? []) as MaterialRow[]).filter((row) => row.storage_path);
  const attachments: DraftAttachment[] = [];

  for (const row of rows) {
    const download = await supabase.storage
      .from(BUCKET)
      .download(row.storage_path!);

    if (download.error || !download.data) continue;

    const bytes = Buffer.from(await download.data.arrayBuffer());

    if (bytes.byteLength > MAX_ONE_BYTE) {
      return {
        attachments: [],
        error: `"${row.name}" pesa demasiado para mandárselo a la IA.`,
      };
    }

    const mime = row.mime ?? "application/octet-stream";

    if (mime.startsWith("image/") || mime === "application/pdf") {
      attachments.push({
        name: row.name,
        mimeType: mime,
        base64: bytes.toString("base64"),
      });
      continue;
    }

    const extracted = await extractText(bytes, row.name, row.mime);

    if (!extracted?.text.trim()) {
      return {
        attachments: [],
        error: `No se pudo leer "${row.name}". Convertilo a PDF y volvé a intentar.`,
      };
    }

    attachments.push({
      name: row.name,
      mimeType: "text/plain",
      text: extracted.text.slice(0, 20_000),
    });
  }

  return { attachments };
}
