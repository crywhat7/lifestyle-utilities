import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toWinAnsi, wrap } from "@/lib/office";

/**
 * "Andá acá, después acá, y ahí está" — en papel.
 *
 * Esta es la función del módulo llevada a su conclusión. Saber que el cable
 * está "en la gaveta 2" no le sirve a nadie que no viva en ese cuarto: lo que
 * sirve es ver el camino. La pantalla de la ruta ya lo muestra, pero una
 * pantalla hay que mandarla con una cuenta abierta del otro lado. Un PDF se
 * manda por donde sea, se abre en cualquier teléfono y se imprime y se pega
 * en la puerta del armario.
 *
 * Una hoja, pasos numerados, la foto de cada lugar grande. El texto es lo
 * secundario acá —"Gaveta 2" sigue sin significar nada para un extraño— así
 * que la foto manda y el nombre acompaña.
 *
 * Fuentes estándar de PDF a propósito: no hay que incrustar nada, pesa pocos
 * KB y se abre igual en cualquier lado. Todo el texto pasa por `toWinAnsi`
 * antes de escribirse, que es lo que impide que un nombre con un carácter
 * raro tumbe el documento entero.
 */

const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.45, 0.45, 0.48);
const HAIR = rgb(0.86, 0.85, 0.83);
const WASH = rgb(0.96, 0.95, 0.94);

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const SHOT = 92;
const GAP = 14;

export type TrailStep = {
  name: string;
  detail: string;
  /** El JPEG del lugar, si lo tiene. Lo trae la ruta ya descargado. */
  photo: Uint8Array | null;
};

type Fonts = { regular: PDFFont; bold: PDFFont };

function text(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK
) {
  page.drawText(toWinAnsi(value), { x, y, size, font, color });
}

export async function trailPdf({
  item,
  detail,
  place,
  steps,
}: {
  item: string;
  detail: string;
  /** La ruta escrita en una línea, para quien lea el papel de lejos. */
  place: string;
  steps: TrailStep[];
}) {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  doc.setTitle(`Cómo llegar a ${item}`);
  doc.setSubject("Dónde está guardado");

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  text(page, "COMO LLEGAR A", MARGIN, y - 10, fonts.bold, 9, MUTED);
  y -= 34;
  text(page, item, MARGIN, y - 14, fonts.bold, 26);
  y -= 40;

  for (const line of wrap(place, fonts.regular, 10.5, PAGE.width - MARGIN * 2)) {
    text(page, line, MARGIN, y, fonts.regular, 10.5, MUTED);
    y -= 15;
  }

  y -= 12;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 1,
    color: HAIR,
  });
  y -= 24;

  const rows = [...steps, { name: item, detail, photo: null, last: true } as TrailStep & { last?: boolean }];

  for (const [index, step] of rows.entries()) {
    const last = index === rows.length - 1;
    const height = SHOT;

    /* Un paso no se parte entre dos hojas: si no entra entero, empieza en la
       siguiente. Media foto arriba y media abajo no explica nada. */
    if (y - height < MARGIN) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }

    const top = y;
    const left = MARGIN;

    // El número del paso, o la estrella del final.
    page.drawCircle({
      x: left + 11,
      y: top - 11,
      size: 11,
      color: last ? INK : WASH,
    });
    const label = last ? "X" : String(index + 1);
    const labelWidth = fonts.bold.widthOfTextAtSize(label, 10);
    text(
      page,
      label,
      left + 11 - labelWidth / 2,
      top - 14.5,
      fonts.bold,
      10,
      last ? rgb(1, 1, 1) : INK
    );

    const bodyLeft = left + 32;

    /* El último renglón es la cosa, no un lugar, y no lleva recuadro de foto:
       un marco gris vacío al final parecía un paso más que falta completar
       cuando en realidad es el destino. */
    if (last) {
      let ty = top - 22;

      for (const line of wrap(step.name, fonts.bold, 15, PAGE.width - MARGIN - bodyLeft).slice(0, 2)) {
        text(page, line, bodyLeft, ty, fonts.bold, 15);
        ty -= 19;
      }

      text(page, step.detail, bodyLeft, ty - 2, fonts.regular, 10, MUTED);
      y = top - 56 - GAP;
      continue;
    }

    if (step.photo) {
      try {
        const image = await doc.embedJpg(step.photo);
        page.drawImage(image, {
          x: bodyLeft,
          y: top - SHOT,
          width: SHOT,
          height: SHOT,
        });
      } catch {
        // Una foto ilegible no puede costar el documento: sigue sin ella.
        page.drawRectangle({
          x: bodyLeft,
          y: top - SHOT,
          width: SHOT,
          height: SHOT,
          color: WASH,
        });
      }
    } else {
      page.drawRectangle({
        x: bodyLeft,
        y: top - SHOT,
        width: SHOT,
        height: SHOT,
        color: WASH,
      });
      text(page, "sin foto", bodyLeft + 24, top - SHOT / 2 - 3, fonts.regular, 8, MUTED);
    }

    const textLeft = bodyLeft + SHOT + 16;
    const textWidth = PAGE.width - MARGIN - textLeft;
    let ty = top - 22;

    for (const line of wrap(step.name, fonts.bold, 15, textWidth).slice(0, 2)) {
      text(page, line, textLeft, ty, fonts.bold, 15);
      ty -= 19;
    }

    ty -= 2;
    for (const line of wrap(step.detail, fonts.regular, 10, textWidth).slice(0, 3)) {
      text(page, line, textLeft, ty, fonts.regular, 10, MUTED);
      ty -= 13;
    }

    y = top - height - GAP;

    if (!last) {
      page.drawLine({
        start: { x: MARGIN, y: y + GAP / 2 },
        end: { x: PAGE.width - MARGIN, y: y + GAP / 2 },
        thickness: 0.5,
        color: HAIR,
      });
    }
  }

  return doc.save();
}
