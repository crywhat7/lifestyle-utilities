import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  COURSE_LABEL,
  COURSES,
  formatKcal,
  PLAN_DAYS,
  planDayKcal,
  plannedDishes,
  type PlanSlots,
  type Recipe,
} from "@/lib/fuel";
import { toWinAnsi, wrap } from "@/lib/office";

/**
 * El menú de la semana en papel, para quien cocina.
 *
 * Dos partes y en ese orden porque así se usa en la cocina: primero la
 * tabla —qué va cada día, de un vistazo, pegable en la refri— y después
 * cada preparación una sola vez, con sus ingredientes y pasos. La tabla va
 * apaisada para que entren los seis días; las recetas, verticales, que es
 * como se lee una receta.
 *
 * Fuentes estándar de PDF a propósito: no hay que incrustar nada, pesa pocos
 * KB y se abre igual en cualquier teléfono. Todo el texto pasa por
 * `toWinAnsi` antes de escribirse: un carácter raro de la IA no puede
 * tumbar el documento entero.
 */

const INK = rgb(0.13, 0.11, 0.09);
const MUTED = rgb(0.45, 0.41, 0.37);
const HAIR = rgb(0.84, 0.8, 0.75);
const EMBER = rgb(0.78, 0.33, 0.1);
const WASH = rgb(0.98, 0.95, 0.91);

const LANDSCAPE = { width: 792, height: 612 };
const PORTRAIT = { width: 612, height: 792 };
const MARGIN = 40;

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

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

function lines(value: string, font: PDFFont, size: number, width: number) {
  return wrap(toWinAnsi(value), font, size, width);
}

/* -------------------------------------------------------------------------- */

function drawTable(doc: PDFDocument, fonts: Fonts, slots: PlanSlots, title: string, subtitle: string) {
  const page = doc.addPage([LANDSCAPE.width, LANDSCAPE.height]);
  let y = LANDSCAPE.height - MARGIN;

  text(page, title, MARGIN, y - 20, fonts.bold, 22);
  y -= 38;
  text(page, subtitle, MARGIN, y, fonts.regular, 10, MUTED);
  y -= 22;

  const labelWidth = 78;
  const colWidth = (LANDSCAPE.width - MARGIN * 2 - labelWidth) / PLAN_DAYS.length;
  const pad = 6;
  const size = 9;
  const lead = 11.5;

  // Encabezado: los días.
  const headHeight = 24;
  page.drawRectangle({
    x: MARGIN,
    y: y - headHeight,
    width: LANDSCAPE.width - MARGIN * 2,
    height: headHeight,
    color: WASH,
  });
  PLAN_DAYS.forEach((day, index) => {
    text(page, day.name, MARGIN + labelWidth + index * colWidth + pad, y - 16, fonts.bold, 10);
  });
  y -= headHeight;

  // Una fila por tiempo de comida; el alto lo pone la celda más larga.
  const rows = COURSES.filter((course) => PLAN_DAYS.some((day) => slots[day.key]?.[course]));

  for (const course of rows) {
    const cells = PLAN_DAYS.map((day) => {
      const item = slots[day.key]?.[course];
      return item ? lines(item.name, fonts.regular, size, colWidth - pad * 2) : [];
    });
    const tallest = Math.max(1, ...cells.map((cell) => cell.length));
    const height = tallest * lead + 22;

    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: LANDSCAPE.width - MARGIN, y },
      thickness: 0.6,
      color: HAIR,
    });

    text(page, COURSE_LABEL[course].one, MARGIN + pad, y - 15, fonts.bold, 9.5, EMBER);

    PLAN_DAYS.forEach((day, index) => {
      const x = MARGIN + labelWidth + index * colWidth + pad;
      const item = slots[day.key]?.[course];
      if (!item) {
        text(page, "-", x, y - 15, fonts.regular, size, HAIR);
        return;
      }
      cells[index].forEach((line, row) => text(page, line, x, y - 15 - row * lead, fonts.regular, size));
      text(page, `${formatKcal(item.kcal)} kcal`, x, y - 15 - cells[index].length * lead - 1, fonts.regular, 7.5, MUTED);
    });

    y -= height;
  }

  // Totales del día.
  page.drawLine({ start: { x: MARGIN, y }, end: { x: LANDSCAPE.width - MARGIN, y }, thickness: 1, color: INK });
  text(page, "Total", MARGIN + pad, y - 15, fonts.bold, 9.5);
  PLAN_DAYS.forEach((day, index) => {
    const kcal = planDayKcal(slots, day.key);
    text(
      page,
      kcal ? `${formatKcal(kcal)} kcal` : "-",
      MARGIN + labelWidth + index * colWidth + pad,
      y - 15,
      fonts.bold,
      9,
      kcal ? INK : HAIR
    );
  });

  text(
    page,
    "Las preparaciones de cada plato están en las páginas siguientes. Porciones para una persona.",
    MARGIN,
    MARGIN - 8,
    fonts.italic,
    8.5,
    MUTED
  );
}

/* -------------------------------------------------------------------------- */

function drawRecipes(doc: PDFDocument, fonts: Fonts, slots: PlanSlots, recipes: Record<string, Recipe>) {
  const width = PORTRAIT.width - MARGIN * 2;
  let page = doc.addPage([PORTRAIT.width, PORTRAIT.height]);
  let y = PORTRAIT.height - MARGIN;

  function room(needed: number) {
    if (y - needed >= MARGIN) return;
    page = doc.addPage([PORTRAIT.width, PORTRAIT.height]);
    y = PORTRAIT.height - MARGIN;
  }

  text(page, "Preparaciones", MARGIN, y - 20, fonts.bold, 20);
  y -= 44;

  plannedDishes(slots).forEach(({ item, uses }, index) => {
    const recipe = recipes[item.name];
    const steps = recipe?.steps.length ? recipe.steps : [item.prep].filter(Boolean);

    // Se mide la receta entera antes de dibujarla para no partir el título
    // de sus pasos entre dos hojas.
    const nameLines = lines(`${index + 1}. ${item.name}`, fonts.bold, 13, width);
    const useLines = lines(`Se sirve el ${uses.join(", ").toLowerCase()}`, fonts.italic, 8.5, width);
    const ingredientLines = lines(item.ingredients.join(" · "), fonts.regular, 9.5, width - 10);
    const stepLines = steps.map((step) => lines(step, fonts.regular, 9.5, width - 18));
    const tipLines = recipe?.tip ? lines(`Truco: ${recipe.tip}`, fonts.italic, 9, width) : [];
    const height =
      nameLines.length * 16 +
      useLines.length * 11 +
      14 +
      ingredientLines.length * 12.5 +
      14 +
      stepLines.reduce((sum, block) => sum + block.length * 12.5 + 3, 0) +
      tipLines.length * 12 +
      26;

    room(Math.min(height, PORTRAIT.height - MARGIN * 2));

    nameLines.forEach((line) => {
      text(page, line, MARGIN, y - 13, fonts.bold, 13);
      y -= 16;
    });
    useLines.forEach((line) => {
      text(page, line, MARGIN, y - 9, fonts.italic, 8.5, MUTED);
      y -= 11;
    });

    const meta = [
      recipe?.servings ? `Porción: ${recipe.servings}` : null,
      `${formatKcal(item.kcal)} kcal`,
      `Proteína ${item.protein_g} g · Carbohidratos ${item.carbs_g} g · Grasa ${item.fat_g} g`,
    ]
      .filter(Boolean)
      .join("   ");
    text(page, meta, MARGIN, y - 11, fonts.regular, 8.5, EMBER);
    y -= 20;

    text(page, "Ingredientes", MARGIN, y - 9, fonts.bold, 9.5);
    y -= 14;
    ingredientLines.forEach((line) => {
      room(12.5);
      text(page, line, MARGIN + 10, y - 9, fonts.regular, 9.5);
      y -= 12.5;
    });
    y -= 6;

    text(page, "Pasos", MARGIN, y - 9, fonts.bold, 9.5);
    y -= 14;
    stepLines.forEach((block, step) => {
      block.forEach((line, row) => {
        room(12.5);
        if (row === 0) text(page, `${step + 1}.`, MARGIN + 4, y - 9, fonts.bold, 9.5, EMBER);
        text(page, line, MARGIN + 18, y - 9, fonts.regular, 9.5);
        y -= 12.5;
      });
      y -= 3;
    });

    tipLines.forEach((line) => {
      room(12);
      text(page, line, MARGIN, y - 9, fonts.italic, 9, MUTED);
      y -= 12;
    });

    y -= 12;
    room(10);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PORTRAIT.width - MARGIN, y }, thickness: 0.6, color: HAIR });
    y -= 16;
  });
}

export async function weekPlanPdf(input: {
  slots: PlanSlots;
  recipes: Record<string, Recipe>;
  title: string;
  subtitle: string;
}) {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(input.title));
  doc.setCreator("Lifestyle Utilities · Fuel");

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  drawTable(doc, fonts, input.slots, input.title, input.subtitle);
  drawRecipes(doc, fonts, input.slots, input.recipes);

  return doc.save();
}
