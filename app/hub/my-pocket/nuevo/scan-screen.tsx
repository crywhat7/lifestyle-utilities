"use client";

import {
  startTransition,
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { NavLink } from "@/components/nav-link";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Camera, Check, Scan, Spark } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { dayLabel, sumByCurrency, type PocketCategory } from "@/lib/pocket";
import type { ScannedExpense } from "@/lib/pocket-scan";
import {
  cropToFile,
  FULL_CROP,
  ImageCropper,
  type Crop,
} from "./image-cropper";
import {
  importScanned,
  scanImage,
  type ImportState,
  type ScanState,
} from "./scan-actions";

const SCAN_INITIAL: ScanState = { status: "idle" };
const IMPORT_INITIAL: ImportState = { status: "idle" };

/** Lo que la persona puede cambiar de cada fila antes de guardarla. */
type Edit = { on: boolean; categoryId: string };

/**
 * Registrar quince movimientos a mano es el trabajo que nadie hace: se abre
 * la app, se ve la lista del banco y se pospone. Esta pantalla lo invierte —
 * se adjunta la captura, se recorta lo que interesa y la IA escribe las filas.
 *
 * Tres actos, uno por pantalla: adjuntar, recortar, revisar. La revisión no
 * es un trámite: es donde se ve qué podría estar repetido y qué categoría le
 * tocó a cada cosa, con todo desmarcable. Nada entra sin que se confirme.
 */
export function ScanScreen({
  categories,
  baseCurrency,
}: {
  categories: PocketCategory[];
  baseCurrency: string;
}) {
  // El archivo y su URL viajan juntos: la que se está mostrando se revoca
  // en el mismo momento en que deja de estar en pantalla, no un render después.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [crop, setCrop] = useState<Crop>(FULL_CROP);
  const [cropError, setCropError] = useState<string | null>(null);

  const [scan, scanAction, scanning] = useActionState(scanImage, SCAN_INITIAL);

  const expenses = scan.status === "ready" ? scan.expenses : null;

  function pick(next: File | null) {
    if (picked) URL.revokeObjectURL(picked.url);
    if (!next) {
      setPicked(null);
      return;
    }
    setPicked({ file: next, url: URL.createObjectURL(next) });
    setCrop(FULL_CROP);
    setCropError(null);
  }

  async function read() {
    if (!picked) return;
    setCropError(null);

    try {
      const cropped = await cropToFile(picked.file, crop);
      const data = new FormData();
      data.append("image", cropped);
      startTransition(() => scanAction(data));
    } catch {
      setCropError("No se pudo recortar la imagen. Probá con otra.");
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header
        className="fade flex items-center justify-between"
        style={{ "--d": "40ms" } as CSSProperties}
      >
        <NavLink
          href="/hub/my-pocket/nuevo/egreso"
          className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]"
        >
          <ArrowBack className="size-4" />
          Egreso
        </NavLink>
        <span className="eyebrow">Sale plata</span>
      </header>

      <section className="mt-2">
        <h1
          className="display rise emboss text-[clamp(2.25rem,11vw,3rem)]"
          style={{ "--d": "100ms" } as CSSProperties}
        >
          {expenses ? "Revisá lo leído" : "Leer captura"}
        </h1>
      </section>

      {expenses ? (
        <Review
          expenses={expenses}
          categories={categories}
          baseCurrency={baseCurrency}
        />
      ) : picked ? (
        <>
          <p
            className="rise text-[0.875rem] leading-relaxed text-[var(--text-2)]"
            style={{ "--d": "150ms" } as CSSProperties}
          >
            Dejá dentro del marco solo los movimientos que querés registrar.
            Arrastrá las esquinas.
          </p>

          <div className="rise relative" style={{ "--d": "200ms" } as CSSProperties}>
            <ImageCropper src={picked.url} crop={crop} onChange={setCrop} />
            {scanning ? (
              <div className="scanline" aria-hidden="true" />
            ) : null}
          </div>

          <div
            className="rise flex flex-col gap-3"
            style={{ "--d": "260ms" } as CSSProperties}
          >
            <button
              type="button"
              onClick={read}
              disabled={scanning}
              className="key key-accent h-14 w-full rounded-full text-[1rem] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scanning ? "Leyendo la captura…" : "Leer los movimientos"}
            </button>

            {scanning ? (
              <p className="text-center text-[0.75rem] text-[var(--text-3)]">
                Puede tardar unos segundos. No cierres la pantalla.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => pick(null)}
                className="h-11 text-[0.8125rem] text-[var(--text-3)]"
              >
                Cambiar imagen
              </button>
            )}

            {scan.status === "error" || cropError ? (
              <p
                role="alert"
                className="text-center text-[0.8125rem] text-[var(--danger)]"
              >
                {cropError ?? (scan.status === "error" ? scan.error : null)}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <PickStep onPick={pick} error={scan.status === "error" ? scan.error : null} />
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Primer acto. Dos caminos y ninguna caja de archivo a la vista: en el
 * teléfono la captura ya está en la galería, y el recibo de papel todavía
 * está en la mano.
 */
function PickStep({
  onPick,
  error,
}: {
  onPick: (file: File | null) => void;
  error: string | null;
}) {
  return (
    <>
      <p
        className="rise text-[0.9375rem] leading-relaxed text-[var(--text-2)]"
        style={{ "--d": "150ms" } as CSSProperties}
      >
        Subí la captura de tus movimientos del banco. La IA lee las filas, marca
        lo que ya tenés registrado y vos decidís qué entra.
      </p>

      <label
        className="groove rise flex cursor-pointer flex-col items-center gap-3 px-6 py-12 text-center"
        style={{ "--d": "210ms" } as CSSProperties}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
          <Scan className="size-6" />
        </span>
        <span className="text-[0.9375rem] font-medium">
          Elegir una captura
        </span>
        <span className="max-w-[22ch] text-[0.75rem] text-[var(--text-3)]">
          JPG, PNG o WebP. Se lee y se descarta: la imagen no se guarda.
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        />
      </label>

      <label
        className="key rise flex h-14 cursor-pointer items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium"
        style={{ "--d": "270ms" } as CSSProperties}
      >
        <Camera className="size-[1.125rem] text-[var(--accent-ink)]" />
        Tomar una foto
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="text-center text-[0.8125rem] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Segundo acto. Lo que la IA leyó, fila por fila.
 *
 * Lo que se parece a algo ya registrado llega desmarcado: el trabajo de la
 * pantalla es evitar el gasto duplicado, y ante la duda pierde el registro,
 * no la exactitud del balance. Igual se puede volver a marcar — a veces sí se
 * pagó dos veces lo mismo el mismo día.
 */
function Review({
  expenses,
  categories,
  baseCurrency,
}: {
  expenses: ScannedExpense[];
  categories: PocketCategory[];
  baseCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(
    importScanned,
    IMPORT_INITIAL
  );

  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries(
      expenses.map((expense) => [
        expense.key,
        { on: expense.duplicate === null, categoryId: expense.categoryId ?? "" },
      ])
    )
  );

  const options = useMemo(
    () =>
      categories.filter(
        (category) => category.kind === "expense" || category.kind === "both"
      ),
    [categories]
  );

  const chosen = expenses.filter((expense) => edits[expense.key]?.on);
  const totals = sumByCurrency(chosen);

  const rows = JSON.stringify(
    chosen.map((expense) => {
      const categoryId = edits[expense.key]?.categoryId ?? "";
      return {
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        occurred_at: expense.occurred_at,
        status: expense.status,
        reference: expense.reference,
        categoryId: categoryId || null,
        // Sin id, el nombre es lo que la IA propuso: se crea al confirmar.
        categoryName: categoryId ? "" : expense.categoryName,
        iconKey: expense.iconKey,
      };
    })
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="rows" value={rows} />

      <p
        className="rise text-[0.875rem] leading-relaxed text-[var(--text-2)]"
        style={{ "--d": "150ms" } as CSSProperties}
      >
        {expenses.length === 1
          ? "Un egreso en esa captura."
          : `${expenses.length} egresos en esa captura.`}{" "}
        Desmarcá lo que no quieras registrar.
      </p>

      <ul
        className="rise flex flex-col gap-2"
        style={{ "--d": "210ms" } as CSSProperties}
      >
        {expenses.map((expense) => {
          const edit = edits[expense.key];
          const category = options.find(
            (item) => item.id === edit?.categoryId
          );

          return (
            <li key={expense.key}>
              <div
                className="groove scan-row flex flex-col gap-3 p-3"
                data-on={edit?.on ? "true" : "false"}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={edit?.on ?? false}
                    aria-label={`Registrar ${expense.description}`}
                    onClick={() =>
                      setEdits((current) => ({
                        ...current,
                        [expense.key]: {
                          ...current[expense.key],
                          on: !current[expense.key]?.on,
                        },
                      }))
                    }
                    className="check mt-0.5"
                    data-on={edit?.on ? "true" : "false"}
                  >
                    <Check className="size-3.5" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] font-medium">
                      {expense.description}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.75rem] text-[var(--text-3)]">
                      <span>{dayLabel(expense.occurred_at)}</span>
                      {expense.status === "pending" ? (
                        <span style={{ color: "var(--warn)" }}>pendiente</span>
                      ) : null}
                      {expense.reference ? (
                        <span className="truncate tabular-nums">
                          ref {expense.reference}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <p className="display shrink-0 text-[1.0625rem] tabular-nums">
                    −{formatMoney(expense.amount, expense.currency)}
                  </p>
                </div>

                {expense.duplicate ? (
                  <p
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.75rem]"
                    style={{
                      color: "var(--warn)",
                      background: "color-mix(in srgb, var(--warn) 10%, transparent)",
                    }}
                  >
                    <span aria-hidden="true">
                      {expense.duplicate.reason === "reference" ? "≡" : "≈"}
                    </span>
                    {expense.duplicate.label}
                    {expense.duplicate.reason === "reference"
                      ? " · misma referencia"
                      : null}
                  </p>
                ) : null}

                <label className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
                    {edit?.categoryId ? (
                      <CategoryIcon
                        iconKey={category?.icon_key ?? expense.iconKey}
                        className="size-4"
                      />
                    ) : (
                      <Spark className="size-4" />
                    )}
                  </span>
                  <span className="sr-only">
                    Categoría de {expense.description}
                  </span>
                  <select
                    className="field px-3 py-2 text-[0.8125rem]"
                    value={edit?.categoryId ?? ""}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [expense.key]: {
                          ...current[expense.key],
                          categoryId: event.target.value,
                        },
                      }))
                    }
                  >
                    {/* La opción vacía solo promete crear algo cuando de
                        verdad hay algo que crear: si la IA cayó en una
                        categoría que ya existe, esto es "sin categoría". */}
                    <option value="">
                      {expense.categoryId === null && expense.categoryName
                        ? `${expense.categoryName} · nueva`
                        : "Sin categoría"}
                    </option>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <div
        className="rise flex flex-col gap-3"
        style={{ "--d": "270ms" } as CSSProperties}
      >
        <p className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <span className="eyebrow">Total marcado</span>
          <span className="display text-[1.25rem] tabular-nums">
            {totals.length === 0
              ? formatMoney(0, baseCurrency)
              : totals
                  .map((total) => formatMoney(total.amount, total.currency))
                  .join(" · ")}
          </span>
        </p>

        <button
          type="submit"
          disabled={pending || chosen.length === 0}
          className="key key-accent h-14 w-full rounded-full text-[1rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Guardando…"
            : chosen.length === 0
              ? "Nada marcado"
              : chosen.length === 1
                ? "Registrar 1 egreso"
                : `Registrar ${chosen.length} egresos`}
        </button>

        {state.status === "error" ? (
          <p
            role="alert"
            className="text-center text-[0.8125rem] text-[var(--danger)]"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
