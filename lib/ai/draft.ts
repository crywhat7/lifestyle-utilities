import "server-only";
import { postJson } from "./http";
import { logFailure } from "./types";

/**
 * El borrador en LaTeX de una tarea de Canvas.
 *
 * La promesa del módulo es poder avanzar desde el teléfono en la parada del
 * bus y revisar en casa, así que lo que sale de acá no pretende ser la
 * entrega: es el documento ya armado —estructura, desarrollo, fórmulas
 * puestas donde van— para abrir en Overleaf y terminar.
 *
 * Solo Gemini: es el único de los dos proveedores de la casa que recibe
 * imágenes y PDFs en el mismo turno, y la foto de la pizarra es justamente el
 * contexto que más aporta.
 */

export type DraftFailure =
  | "no_key"
  | "quota"
  | "overloaded"
  | "timeout"
  | "bad_response"
  | "network";

export const DRAFT_MESSAGE: Record<DraftFailure, string> = {
  no_key: "Falta la llave de Gemini en el servidor.",
  quota: "Se acabó la cuota de la IA por hoy. Probá más tarde.",
  overloaded: "La IA está saturada. Probá de nuevo en un momento.",
  timeout: "La IA tardó demasiado. Probá con menos archivos.",
  bad_response: "La IA devolvió algo que no supimos leer.",
  network: "No se pudo llegar a la IA.",
};

/** Un archivo que la persona adjuntó, ya leído. */
export type DraftAttachment = {
  name: string;
  mimeType: string;
  /** Imágenes y PDFs viajan en base64; el texto va como texto. */
  base64?: string;
  text?: string;
};

export type DraftInput = {
  title: string;
  courseName: string;
  dueLabel: string;
  points: number | null;
  /** Las instrucciones de Canvas, ya sin HTML. */
  instructions: string | null;
  /** Lo que la persona pidió además. Puede estar vacío. */
  extraPrompt: string;
  attachments: DraftAttachment[];
};

export type DraftResult =
  | { ok: true; latex: string; model: string }
  | { ok: false; kind: DraftFailure };

const DEFAULT_MODELS = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
];

function models() {
  const forced = process.env.CANVAS_GEMINI_MODEL?.trim();
  return forced ? [forced] : DEFAULT_MODELS;
}

/** La misma llave que ya usa Should I Buy It: una cuenta, un proyecto. */
function apiKey() {
  return process.env.CANVAS_GEMINI_API_KEY ?? process.env.SHOULD_I_BUY_IT_GEMINI_API_KEY;
}

export function isDraftConfigured() {
  return Boolean(apiKey());
}

function buildPrompt(input: DraftInput) {
  const lines = [
    "Sos un asistente académico que redacta borradores de tareas",
    "universitarias en LaTeX. Escribís en español salvo que las",
    "instrucciones pidan otro idioma.",
    "",
    "DEVOLVÉ ÚNICAMENTE CÓDIGO LATEX. Nada de explicaciones antes o después,",
    "nada de ```latex, nada de comentarios dirigidos a mí.",
    "",
    "EL DOCUMENTO:",
    "- Completo y compilable con pdflatex: desde \\documentclass hasta",
    "  \\end{document}.",
    "- Clase article, 12pt, \\usepackage[spanish]{babel},",
    "  \\usepackage[utf8]{inputenc}, \\usepackage{amsmath,amssymb},",
    "  \\usepackage[margin=2.5cm]{geometry}. Sumá los paquetes que la tarea",
    "  pida (graphicx, listings, booktabs, tikz) y ninguno más.",
    "- Encabezado con el título de la tarea y el curso.",
    "- Estructura con \\section y \\subsection según lo que pidan las",
    "  instrucciones: si numeran incisos, respetá esa numeración exacta.",
    "- Matemática siempre en modo matemático; nada de x^2 suelto en el texto.",
    "",
    "HONESTIDAD — esto es lo más importante:",
    "- Es un BORRADOR para que una persona lo revise y lo termine, no una",
    "  entrega final.",
    "- Lo que no puedas saber (datos del curso, mediciones, resultados de un",
    "  laboratorio que no viste, la opinión de quien entrega) va como",
    "  \\textit{[completar: ...]} diciendo exactamente qué falta.",
    "- No inventes citas, fuentes, autores ni números. Si algo necesita una",
    "  referencia real, dejá el marcador para que se busque.",
    "",
    "LA TAREA:",
    `- Título: ${input.title}`,
    `- Curso: ${input.courseName}`,
    `- Entrega: ${input.dueLabel}`,
  ];

  if (input.points != null) lines.push(`- Vale ${input.points} puntos.`);

  lines.push(
    "",
    "INSTRUCCIONES DE CANVAS (literal):",
    input.instructions?.trim()
      ? input.instructions.slice(0, 12_000)
      : "(la tarea no traía instrucciones escritas en Canvas)"
  );

  if (input.extraPrompt.trim()) {
    lines.push(
      "",
      "LO QUE PIDE ADEMÁS QUIEN ENTREGA (mandan estas indicaciones sobre",
      "cualquier suposición tuya):",
      input.extraPrompt.trim().slice(0, 4_000)
    );
  }

  const textFiles = input.attachments.filter((file) => file.text);

  if (textFiles.length) {
    lines.push("", "MATERIAL ADJUNTO EN TEXTO:");
    for (const file of textFiles) {
      lines.push(`--- ${file.name} ---`, file.text!.slice(0, 20_000));
    }
  }

  const binaries = input.attachments.filter((file) => file.base64);

  if (binaries.length) {
    lines.push(
      "",
      `Además se adjuntan ${binaries.length} archivo(s) —fotos de apuntes, del`,
      "enunciado o PDFs del curso—. Son contexto de primera mano: si lo que",
      "muestran contradice una suposición tuya, mandan ellos."
    );
  }

  return lines.join("\n");
}

/**
 * Quita el cerco de ```latex si el modelo lo puso igual.
 *
 * Pedirlo en el prompt funciona casi siempre, y "casi" no alcanza cuando lo
 * que sigue es pegar el texto en Overleaf.
 */
function unfence(raw: string) {
  const text = raw.trim();
  const fenced = text.match(/^```(?:latex|tex)?\s*\n([\s\S]*?)\n```$/i);
  return (fenced ? fenced[1] : text).trim();
}

export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const key = apiKey();
  if (!key) return { ok: false, kind: "no_key" };

  const parts: Record<string, unknown>[] = [{ text: buildPrompt(input) }];

  for (const file of input.attachments) {
    if (!file.base64) continue;
    parts.push({
      inline_data: { mime_type: file.mimeType, data: file.base64 },
    });
  }

  let last: DraftFailure = "network";

  for (const model of models()) {
    const label = `gemini/${model}`;
    const outcome = await postJson(
      label,
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": key },
      JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          // Un borrador académico no quiere creatividad: quiere estructura.
          temperature: 0.4,
          maxOutputTokens: 8_192,
        },
      })
    );

    if (!outcome.ok) {
      last = outcome.kind;
      // Red y tiempo agotado no mejoran cambiando de modelo.
      if (last === "network" || last === "timeout") break;
      continue;
    }

    const payload = outcome.payload as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      logFailure(`${label} respondió sin texto`);
      last = "bad_response";
      continue;
    }

    const latex = unfence(text);

    // Sin \begin{document} no es un documento: es una disculpa del modelo.
    if (!/\\begin\{document\}/.test(latex)) {
      logFailure(`${label} no devolvió un documento LaTeX`, latex);
      last = "bad_response";
      continue;
    }

    return { ok: true, latex, model: label };
  }

  return { ok: false, kind: last };
}
