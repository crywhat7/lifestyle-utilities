"use client";

import {
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { Camera, Check, Cross, Spark, Trash } from "@/components/icons";
import { dayStatus, formatKcal, mealMacros, PORTIONS, type DayTone } from "@/lib/fuel";
import { deleteMeal, logMeal, setPortion, type LogState } from "./actions";
import { CountUp } from "./count-up";
import { preparePhoto } from "./photo";

const IDLE: LogState = { status: "idle" };

type Photo = { image: File; thumb: string; preview: string };

/**
 * El fogón: el medidor del día y el botón de registrar, en la misma pieza.
 *
 * Todo el módulo existe para este toque. Por eso no hay que buscarlo: ocupa
 * media pantalla, dice lo único que importa en ese momento —cuánto te
 * queda— y abre la cámara directo. La descripción y la galería viven en la
 * hoja que sube después, como opciones, nunca como pasos obligatorios.
 */
export function Hearth({
  target,
  eaten,
  tone,
}: {
  target: number;
  eaten: number;
  tone: DayTone;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Cada apertura es una sesión nueva: el formulario se monta de cero y el
  // resultado de la comida anterior no se asoma en la siguiente.
  const [session, setSession] = useState(0);

  const remaining = target - eaten;
  const over = tone === "over";
  const percent = Math.min(100, (eaten / target) * 100);
  const overflow = over ? Math.min(100, ((eaten - target) / target) * 100) : 0;

  function open() {
    setSession((value) => value + 1);
    if (!sheet.current?.open) sheet.current?.showModal();
  }

  function close() {
    sheet.current?.close();
  }

  function forget() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.preview);
      return null;
    });
    setPhotoError(null);
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);

    try {
      const next = await preparePhoto(file);
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.preview);
        return next;
      });
    } catch {
      setPhotoError("No se pudo leer esa foto. Probá con otra.");
    }

    if (!sheet.current?.open) open();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => gallery.current?.click()}
        className="hearth"
        aria-label={`Registrar una comida. ${
          over
            ? `Te pasaste por ${formatKcal(-remaining)} kilocalorías`
            : `Te quedan ${formatKcal(remaining)} de ${formatKcal(target)} kilocalorías`
        }`}
        style={{ "--p": percent, "--o": overflow } as CSSProperties}
      >
        <span aria-hidden="true" className="hearth-ring" />
        {over ? <span aria-hidden="true" className="hearth-overflow" /> : null}
        <span aria-hidden="true" className="hearth-disc" />

        <span aria-hidden="true" className="hearth-face">
          <span className="e-eyebrow">
            {remaining >= 0 ? "Te quedan" : over ? "Te pasaste" : "Apenas pasado"}
          </span>
          <CountUp
            value={Math.abs(remaining)}
            // Al abrir, la cifra baja desde la meta hasta lo que queda: se ve
            // lo comido restarse. Pasado de la meta no hay nada que restar.
            from={remaining > 0 && eaten > 0 ? target : undefined}
            className="e-figure hearth-number mt-3"
          />
          <span className="mt-2 text-[0.8125rem] text-[var(--e-ink-3)]">
            {formatKcal(eaten)} de {formatKcal(target)} kcal
          </span>
          <span className="hearth-shutter">
            <Camera className="size-4" />
            Comí algo
          </span>
        </span>
      </button>

      <div className="kindle flex justify-center" style={{ "--d": "700ms" } as CSSProperties}>
        <button
          type="button"
          onClick={() => {
            forget();
            open();
          }}
          className="px-3 py-2 text-[0.8125rem] text-[var(--e-ink-3)] underline decoration-[var(--e-hair-2)] underline-offset-4"
        >
          o escribilo sin foto
        </button>
      </div>

      {/*
        Dos entradas de archivo. La del fogón no lleva `capture`: así el
        sistema ofrece las dos cosas en un solo toque —cámara o galería— en
        vez de forzar la cámara. La de `capture` queda para el botón "Tomar
        foto" de la hoja, que es un pedido explícito de cámara.
      */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <dialog
        ref={sheet}
        className="e-sheet"
        aria-label="Registrar comida"
        onClose={forget}
        onClick={(event) => {
          // Tocar el velo cierra, igual que en cualquier hoja del sistema.
          if (event.target === sheet.current) close();
        }}
      >
        <span aria-hidden="true" className="e-grip" />
        <Capture
          key={session}
          photo={photo}
          photoError={photoError}
          target={target}
          onCamera={() => camera.current?.click()}
          onGallery={() => gallery.current?.click()}
          onDropPhoto={forget}
          onDone={close}
        />
      </dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const CONFIDENCE: Record<string, string> = {
  high: "Estimación segura",
  medium: "Estimación probable",
  low: "Estimación aproximada",
};

function Capture({
  photo,
  photoError,
  target,
  onCamera,
  onGallery,
  onDropPhoto,
  onDone,
}: {
  photo: Photo | null;
  photoError: string | null;
  target: number;
  onCamera: () => void;
  onGallery: () => void;
  onDropPhoto: () => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<LogState>(IDLE);
  const [pending, startPending] = useTransition();
  const [description, setDescription] = useState("");

  if (state.status === "saved") {
    return <Result state={state} target={target} onDone={onDone} />;
  }

  /*
    La acción se llama a mano y no con `useActionState` por una razón:
    si la respuesta no llega —la función se cortó, se cayó la señal—, con
    `useActionState` el error sube hasta el borde de la página y la
    pantalla entera queda en blanco con un botón de "Reload". Así, lo peor
    que puede pasar es un mensaje debajo del botón y otro intento.
  */
  function submit() {
    const data = new FormData();
    data.append("description", description);
    if (photo) {
      data.append("image", photo.image);
      data.append("thumb", photo.thumb);
    }

    startPending(async () => {
      try {
        setState(await logMeal(IDLE, data));
      } catch {
        setState({
          status: "error",
          error: "Se cortó la conexión con el servidor. Tu foto sigue acá: probá de nuevo.",
        });
      }
    });
  }

  const ready = Boolean(photo) || description.trim().length >= 3;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="e-display text-[2rem]">{pending ? "Mirando el plato…" : "¿Qué comiste?"}</h2>
        <button
          type="button"
          onClick={onDone}
          aria-label="Cerrar"
          className="e-key flex size-10 shrink-0 items-center justify-center"
        >
          <Cross className="size-3.5" />
        </button>
      </div>

      {photo ? (
        <div className="e-photo" data-busy={pending}>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL local de la cámara, no hay nada que optimizar */}
          <img src={photo.preview} alt="La foto de lo que comiste" />
          {pending ? null : (
            <button
              type="button"
              onClick={onDropPhoto}
              className="e-key absolute top-3 right-3 flex h-9 items-center gap-1.5 px-3 text-[0.75rem]"
            >
              <Trash className="size-3.5" />
              Quitar
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCamera}
            className="e-key flex h-12 items-center justify-center gap-2 text-[0.8125rem]"
          >
            <Camera className="size-4" />
            Tomar foto
          </button>
          <button
            type="button"
            onClick={onGallery}
            className="e-key flex h-12 items-center justify-center text-[0.8125rem]"
          >
            De la galería
          </button>
        </div>
      )}

      {photoError ? (
        <p role="alert" className="text-[0.8125rem] text-[var(--e-over-ink)]">
          {photoError}
        </p>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="e-eyebrow">{photo ? "Detalles (opcional)" : "Descripción"}</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 280))}
          rows={3}
          disabled={pending}
          placeholder={
            photo
              ? "Media porción, sin azúcar, con crema…"
              : "2 baleadas con huevo y aguacate, un café con leche"
          }
          className="e-field resize-none leading-relaxed"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!ready || pending}
        className="e-key e-key-lit flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
      >
        <Spark className="size-4" />
        {pending ? "Calculando…" : "Calcular y registrar"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--e-over-ink)]">
          {state.error}
        </p>
      ) : (
        <p className="text-center text-[0.75rem] leading-relaxed text-[var(--e-ink-3)]">
          La foto se lee y se descarta; solo queda una miniatura para tu lista.
        </p>
      )}
    </div>
  );
}

/**
 * Lo que calculó la IA, ya guardado.
 *
 * La porción se corrige acá mismo porque es el momento en que la persona
 * todavía tiene el plato enfrente: "no, fue la mitad" se sabe ahora, no a
 * las nueve de la noche revisando la lista.
 */
function Result({
  state,
  target,
  onDone,
}: {
  state: Extract<LogState, { status: "saved" }>;
  target: number;
  onDone: () => void;
}) {
  const { meal } = state;
  const [portion, setLocal] = useState(meal.portion);
  const [busy, startBusy] = useTransition();

  const base = mealMacros(meal).kcal;
  const now = mealMacros({ ...meal, portion }).kcal;
  const day = state.dayKcal - base + now;
  const { remaining, tone } = dayStatus(day, target);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        {meal.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura en data URL
          <img src={meal.thumb} alt="" className="meal-thumb size-16" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="e-eyebrow">Registrado</p>
          <h2 className="e-display mt-2 text-[1.75rem]">{meal.name}</h2>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="e-figure text-[5.5rem] text-[var(--e-ink-hot)]">
          +<CountUp value={now} from={0} duration={1100} />
        </span>
        <span className="mb-2 text-[0.875rem] text-[var(--e-ink-3)]">kcal</span>
      </div>

      {meal.note ? (
        <p className="-mt-2 text-[0.875rem] leading-relaxed text-[var(--e-ink-2)]">{meal.note}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--e-ink-3)]">
        <span className="e-sunk px-2.5 py-1">{CONFIDENCE[meal.confidence ?? "medium"]}</span>
        <span className="e-sunk px-2.5 py-1 tabular-nums">
          P {mealMacros({ ...meal, portion }).protein} · C {mealMacros({ ...meal, portion }).carbs} · G{" "}
          {mealMacros({ ...meal, portion }).fat} g
        </span>
      </div>

      <div>
        <p className="e-eyebrow mb-2.5">¿Cuánto fue?</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Porción">
          {PORTIONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={portion === value}
              data-on={portion === value}
              disabled={busy}
              onClick={() => {
                setLocal(value);
                startBusy(() => setPortion(meal.id, value));
              }}
              className="e-opt h-11 text-[0.875rem] tabular-nums"
            >
              {value === 0.5 ? "½" : `×${value}`}
            </button>
          ))}
        </div>
      </div>

      <p className="e-sunk p-3.5 text-[0.875rem] leading-relaxed text-[var(--e-ink-2)]">
        {tone === "over"
          ? `Con esto te pasaste por ${formatKcal(-remaining)} kcal hoy.`
          : tone === "met"
            ? "Con esto llegaste a tu meta del día."
            : `Te quedan ${formatKcal(remaining)} kcal para hoy.`}
      </p>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              await deleteMeal(meal.id);
              onDone();
            })
          }
          className="e-key flex h-13 items-center justify-center gap-2 px-5 text-[0.8125rem]"
        >
          <Trash className="size-3.5" />
          Deshacer
        </button>
        <button
          type="button"
          onClick={onDone}
          className="e-key e-key-lit flex h-13 items-center justify-center gap-2 text-[0.9375rem] font-medium"
        >
          <Check className="size-4" />
          Listo
        </button>
      </div>
    </div>
  );
}
