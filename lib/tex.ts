import "server-only";

/**
 * Compilar LaTeX de verdad, sin tener LaTeX.
 *
 * Una instalación de TeX pesa gigas y no cabe en una función de servidor, así
 * que el documento se manda al compilador público de texlive.net —el mismo
 * que usa el botón "Run LaTeX here" de TeX StackExchange— y vuelve el PDF ya
 * armado, con la matemática tipografiada como corresponde.
 *
 * Lo que eso implica, dicho donde se pueda leer: el texto del borrador sale
 * de nuestro servidor hacia un tercero. Por eso no se compila solo ni al
 * generar: se compila cuando alguien toca el botón, y el botón dice a dónde
 * va. Es cortesía de una persona, además, así que se pide de a uno y con
 * tiempo de espera corto.
 */

const ENDPOINT = "https://texlive.net/cgi-bin/latexcgi";
const TIMEOUT_MS = 60_000;

/** Un documento más largo que esto no es una tarea, es un libro. */
export const MAX_SOURCE_CHARS = 200_000;

export type CompileResult =
  | { ok: true; pdf: Buffer }
  | { ok: false; error: string };

/**
 * El error de TeX, en una línea.
 *
 * El log son tres mil líneas de rutas de paquetes y una sola que importa: la
 * que empieza con "!". Se busca esa y, si viene, el número de línea que TeX
 * imprime abajo como "l.42".
 */
function readLog(log: string) {
  const lines = log.split("\n");
  const index = lines.findIndex((line) => line.startsWith("!"));

  if (index === -1) {
    return "El compilador no devolvió un PDF y tampoco dijo por qué.";
  }

  const message = lines[index].replace(/^!\s*/, "").trim();
  const at = lines.slice(index, index + 8).find((line) => /^l\.\d+/.test(line));
  const number = at?.match(/^l\.(\d+)/)?.[1];

  return number ? `Línea ${number}: ${message}` : message;
}

/** Compila con pdflatex y devuelve el PDF, o el error de TeX ya legible. */
export async function compileLatex(source: string): Promise<CompileResult> {
  const text = source.trim();

  if (!text) return { ok: false, error: "El borrador está vacío." };
  if (text.length > MAX_SOURCE_CHARS) {
    return { ok: false, error: "El documento es demasiado largo para compilar." };
  }

  const form = new FormData();
  form.append("return", "pdf");
  form.append("engine", "pdflatex");
  form.append("filename[]", "document.tex");
  form.append("filecontents[]", text);

  let response: Response;

  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      body: form,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut
        ? "El compilador tardó demasiado."
        : "No se pudo llegar al compilador.",
    };
  }

  if (!response.ok) {
    return { ok: false, error: `El compilador respondió ${response.status}.` };
  }

  const type = (response.headers.get("content-type") ?? "").toLowerCase();

  // Cuando falla no devuelve un error HTTP: devuelve el log en texto plano.
  if (!type.includes("pdf")) {
    return { ok: false, error: readLog(await response.text()) };
  }

  const pdf = Buffer.from(await response.arrayBuffer());

  if (pdf.byteLength < 1000 || pdf.subarray(0, 4).toString() !== "%PDF") {
    return { ok: false, error: "Lo que volvió no era un PDF." };
  }

  return { ok: true, pdf };
}
