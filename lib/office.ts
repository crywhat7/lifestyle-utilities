import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Documentos de oficina, leídos y convertidos a PDF.
 *
 * Existe por dos razones que en el fondo son la misma: un .docx no se puede
 * abrir en el teléfono sin una app que lo entienda, y la IA tampoco lo lee
 * —Gemini recibe imágenes y PDFs, no Word—. Sacar el texto resuelve las dos:
 * la persona se baja un PDF que abre en cualquier lado y el borrador puede
 * usar el enunciado que venía adentro de la plantilla.
 *
 * Lo que sale NO es una copia fiel: es el texto y las tablas, limpios y
 * paginados. Los márgenes, la tipografía y las imágenes del original se
 * pierden, y eso se dice en pantalla en vez de prometer lo contrario.
 */

export type OfficeKind = "docx" | "sheet" | "text" | "unsupported";

const EXT = (name: string) =>
  (name.match(/\.([a-z0-9]{1,6})(?:$|[?#])/i)?.[1] ?? "").toLowerCase();

/** Qué sabemos leer, mirando el nombre primero y el tipo después. */
export function officeKind(name: string, mime: string | null): OfficeKind {
  const ext = EXT(name);
  const type = (mime ?? "").toLowerCase();

  if (ext === "docx" || type.includes("wordprocessingml")) return "docx";

  if (
    ["xlsx", "xlsm", "csv"].includes(ext) ||
    type.includes("spreadsheetml") ||
    type === "text/csv"
  ) {
    return "sheet";
  }

  if (
    ["txt", "md", "tex", "json", "log", "bib"].includes(ext) ||
    type.startsWith("text/")
  ) {
    return "text";
  }

  // .doc y .xls son formatos binarios de los noventa: no hay forma honesta
  // de leerlos en JavaScript, y fingir que sí saldría peor que decirlo.
  return "unsupported";
}

/** Lo que se puede convertir a PDF y mandarle a la IA como texto. */
export function isConvertible(name: string, mime: string | null) {
  return officeKind(name, mime) !== "unsupported";
}

export const UNSUPPORTED_MESSAGE =
  "Formato viejo (.doc, .xls, .ppt). Abrilo una vez y guardalo como .docx o .xlsx.";

/* -------------------------------------------------------------------------- */
/* Leer                                                                        */
/* -------------------------------------------------------------------------- */

export type Extracted = {
  text: string;
  /** Las hojas de cálculo se pintan en monoespaciada o las columnas bailan. */
  mono: boolean;
};

async function readDocx(bytes: Buffer): Promise<Extracted> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });

  return { text: result.value.trim(), mono: false };
}

/**
 * Cada hoja como un bloque de filas separadas por " | ".
 *
 * Las columnas vacías del final se descartan: Excel guarda filas de
 * doscientas celdas donde solo hay cinco con algo, y arrastrarlas convierte
 * cualquier tabla en una tira de barras verticales.
 */
async function readSheet(bytes: Buffer): Promise<Extracted> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

  const blocks: string[] = [];

  workbook.eachSheet((sheet) => {
    const lines: string[] = [];

    sheet.eachRow((row) => {
      const cells: string[] = [];

      row.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value;

        if (value == null) cells.push("");
        else if (value instanceof Date) cells.push(value.toISOString().slice(0, 10));
        else if (typeof value === "object" && "result" in value) {
          cells.push(String((value as { result?: unknown }).result ?? ""));
        } else if (typeof value === "object" && "text" in value) {
          cells.push(String((value as { text?: unknown }).text ?? ""));
        } else cells.push(String(value));
      });

      while (cells.length > 0 && cells[cells.length - 1].trim() === "") {
        cells.pop();
      }

      if (cells.length > 0) lines.push(cells.join(" | "));
    });

    if (lines.length > 0) {
      blocks.push(`# ${sheet.name}`, ...lines, "");
    }
  });

  return { text: blocks.join("\n").trim(), mono: true };
}

/** El texto de un archivo del bucket, sea cual sea su formato. */
export async function extractText(
  bytes: Buffer,
  name: string,
  mime: string | null
): Promise<Extracted | null> {
  const kind = officeKind(name, mime);

  try {
    if (kind === "docx") return await readDocx(bytes);
    if (kind === "sheet") {
      // Un CSV es texto plano disfrazado: pasarlo por Excel lo rompe.
      if (EXT(name) === "csv" || (mime ?? "").includes("csv")) {
        return { text: bytes.toString("utf8").trim(), mono: true };
      }
      return await readSheet(bytes);
    }
    if (kind === "text") return { text: bytes.toString("utf8").trim(), mono: false };
  } catch (error) {
    console.error(
      "[office] no se pudo leer el documento",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Escribir el PDF                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Las fuentes estándar de PDF hablan WinAnsi y nada más.
 *
 * Un guion largo o una comilla curva entran; una flecha "→", una viñeta "•"
 * de otra familia o un emoji hacen que `pdf-lib` tire una excepción y se
 * pierda el documento entero. Se cambian por su equivalente de toda la vida
 * antes de escribir una sola letra.
 */
const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[–—]/g, "-"],
  [/…/g, "..."],
  [/[•●▪]/g, "-"],
  [/[→⇒]/g, "->"],
  [/[←⇐]/g, "<-"],
  [/ /g, " "],
  [/\t/g, "    "],
];

function toWinAnsi(text: string) {
  let clean = text;
  for (const [pattern, into] of REPLACEMENTS) clean = clean.replace(pattern, into);

  // Lo que quede fuera del repertorio se marca en vez de reventar: una
  // fórmula griega perdida es un "?" y el resto del documento se salva.
  return clean.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const SIZE = 10.5;
const LEAD = 15;

/** Corta un párrafo en renglones que entren en el ancho útil. */
function wrap(
  text: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
  maxWidth: number
) {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    let line = "";

    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);

      // Una palabra sola más ancha que la página —una URL larga, una fila de
      // Excel sin espacios— se parte a lo bruto: mejor cortada que fuera.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";

        for (const letter of word) {
          if (font.widthOfTextAtSize(chunk + letter, size) > maxWidth) {
            lines.push(chunk);
            chunk = letter;
          } else chunk += letter;
        }

        line = chunk;
      } else line = word;
    }

    if (line) lines.push(line);
  }

  return lines;
}

export type PdfInput = {
  title: string;
  /** De dónde salió: el nombre del archivo original. */
  source: string;
  text: string;
  mono: boolean;
};

/** El PDF: portadilla mínima, texto paginado, nada de decoración. */
export async function textToPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const body = await pdf.embedFont(
    input.mono ? StandardFonts.Courier : StandardFonts.Helvetica
  );
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = PAGE.width - MARGIN * 2;
  const ink = rgb(0.11, 0.11, 0.12);
  const faded = rgb(0.45, 0.45, 0.47);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  const write = (
    text: string,
    font: typeof body,
    size: number,
    color: typeof ink
  ) => {
    for (const line of wrap(text, font, size, width)) {
      if (y - LEAD < MARGIN) newPage();
      if (line) {
        page.drawText(line, { x: MARGIN, y, size, font, color });
      }
      y -= size <= SIZE ? LEAD : size * 1.25;
    }
  };

  write(toWinAnsi(input.title), bold, 16, ink);
  y -= 4;
  write(toWinAnsi(`Convertido de ${input.source}`), body, 9, faded);
  y -= 12;

  const text = toWinAnsi(input.text) || "(el documento no tenía texto)";
  write(text, body, input.mono ? 8.5 : SIZE, ink);

  return pdf.save();
}
