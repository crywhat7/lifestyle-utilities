"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { NavLink } from "@/components/nav-link";
import { CategoryIcon } from "@/components/category-icons";
import { ArrowBack, Mic, Spark, Stop } from "@/components/icons";
import { CURRENCIES } from "@/lib/money";
import { type PocketCategory } from "@/lib/pocket";
import { createTransaction, type FormState } from "../actions";
import { readVoiceExpense, type VoiceState } from "./voice-actions";

/**
 * Siete segundos. Es el contrato de esta pantalla y por eso está en todos
 * lados: en el número grande antes de grabar, en el anillo que se vacía
 * mientras grabás y en las siete barras de la onda — una por segundo.
 *
 * El límite no es una restricción técnica disfrazada de diseño: un gasto se
 * dicta en cuatro segundos ("ciento veinte en el súper") y todo lo que pase
 * de ahí es alguien contando una historia que la IA va a tener que resumir mal.
 */
const LIMIT_MS = 7_000;
const BARS = 7;

const VOICE_INITIAL: VoiceState = { status: "idle" };
const SAVE_INITIAL: FormState = { status: "idle" };

/** El primero que soporte el navegador. Safari solo da mp4; Chrome, webm. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
}

/* -------------------------------------------------------------------------- */

export function VoiceScreen({
  categories,
  baseCurrency,
}: {
  categories: PocketCategory[];
  baseCurrency: string;
}) {
  const [voice, voiceAction, reading] = useActionState(
    readVoiceExpense,
    VOICE_INITIAL
  );

  // Lo que ya se descartó. "Grabar de nuevo" no puede ser un enlace a esta
  // misma ruta —el router no remonta nada y la pantalla se queda igual—, así
  // que se recuerda cuál resultado se dio por visto y se vuelve al dial.
  const [dismissed, setDismissed] = useState<VoiceState | null>(null);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(LIMIT_MS / 1000);
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopperRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  /** Todo lo que hay que soltar: el micro se apaga apenas deja de hacer falta. */
  const teardown = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (clockRef.current !== null) clearInterval(clockRef.current);
    if (stopperRef.current !== null) clearTimeout(stopperRef.current);
    frameRef.current = null;
    clockRef.current = null;
    stopperRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  async function start() {
    setMicError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      recorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        // La extensión importa: el transcriptor la mira para decodificar.
        const name = type.includes("mp4") ? "gasto.mp4" : "gasto.webm";

        teardown();
        setRecording(false);
        setLeft(LIMIT_MS / 1000);

        if (blob.size < 1_000) {
          setMicError("Fue demasiado corto. Mantené y hablá.");
          return;
        }

        const data = new FormData();
        data.append("audio", new File([blob], name, { type }));
        startTransition(() => voiceAction(data));
      };

      // La onda es la prueba de que el micro está oyendo: sin ella, siete
      // segundos frente a un botón quieto son siete segundos de duda.
      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(stream).connect(analyser);
      const spectrum = new Uint8Array(analyser.frequencyBinCount);

      const startedAt = performance.now();
      let shown = LIMIT_MS / 1000;

      // La onda va en requestAnimationFrame porque es puro dibujo, y si el
      // navegador la frena no se pierde nada.
      const tick = () => {
        analyser.getByteFrequencyData(spectrum);

        for (let index = 0; index < BARS; index++) {
          const bar = barsRef.current[index];
          if (!bar) continue;
          const value = spectrum[index + 1] ?? 0;
          // Solo transform: la onda corre en la GPU y no toca el layout.
          bar.style.transform = `scaleY(${0.12 + (value / 255) * 0.88})`;
        }

        frameRef.current = requestAnimationFrame(tick);
      };

      // El contador tiene su propio reloj, y no es capricho: el navegador
      // frena requestAnimationFrame cuando la pantalla no está a la vista, y
      // el número que dice cuánto falta no puede congelarse mientras el micro
      // sigue abierto. El intervalo sigue corriendo; el corte duro también.
      const count = () => {
        const remaining = Math.max(
          0,
          (LIMIT_MS - (performance.now() - startedAt)) / 1000
        );
        const next = Math.ceil(remaining);
        if (next !== shown) {
          shown = next;
          setLeft(next);
        }
      };

      recorder.start();
      setRecording(true);
      setLeft(LIMIT_MS / 1000);
      frameRef.current = requestAnimationFrame(tick);
      clockRef.current = setInterval(count, 200);

      // El corte duro vive acá y no en el `onstop`: pase lo que pase con la
      // interfaz, a los siete segundos el micro se apaga.
      stopperRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, LIMIT_MS);
    } catch {
      teardown();
      setRecording(false);
      setMicError(
        "No se pudo usar el micrófono. Revisá el permiso del navegador."
      );
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  const draft =
    voice.status === "ready" && voice !== dismissed ? voice : null;
  const error =
    micError ?? (voice.status === "error" ? voice.error : null);

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

      {draft ? (
        <Review
          draft={draft}
          categories={categories}
          baseCurrency={baseCurrency}
          onAgain={() => setDismissed(voice)}
        />
      ) : (
        <Recorder
          recording={recording}
          reading={reading}
          left={left}
          barsRef={barsRef}
          error={error}
          transcript={voice.status === "error" ? voice.transcript : undefined}
          onStart={start}
          onStop={stop}
        />
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Primer acto: el dial.
 *
 * El número de segundos ocupa el centro del disco y es lo más grande de la
 * pantalla después del título. Antes de grabar dice 7 — la promesa; mientras
 * grabás, baja. Nunca hay que preguntarse cuánto queda.
 */
function Recorder({
  recording,
  reading,
  left,
  barsRef,
  error,
  transcript,
  onStart,
  onStop,
}: {
  recording: boolean;
  reading: boolean;
  left: number;
  barsRef: React.RefObject<(HTMLSpanElement | null)[]>;
  error: string | null;
  transcript?: string;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <>
      <section className="mt-2">
        <h1
          className="display rise emboss text-[clamp(2.25rem,11vw,3rem)]"
          style={{ "--d": "100ms" } as CSSProperties}
        >
          Dictá el gasto
        </h1>
        <p
          className="rise mt-3 max-w-[26ch] text-[0.9375rem] leading-relaxed text-[var(--text-2)]"
          style={{ "--d": "150ms" } as CSSProperties}
        >
          Decí cuánto y en qué. Por ejemplo:{" "}
          <span className="text-[var(--text-1)]">
            “ciento veinte en el súper”
          </span>
          .
        </p>
      </section>

      <div
        className="rise flex flex-1 flex-col items-center justify-center gap-7"
        style={{ "--d": "220ms" } as CSSProperties}
      >
        <div className="dictate" data-on={recording ? "true" : "false"}>
          {/* El anillo se vacía en línea recta y a propósito: un contador que
              acelera o frena miente sobre el tiempo que queda. */}
          <svg viewBox="0 0 120 120" aria-hidden="true" className="dictate-ring">
            <circle className="dictate-track" cx="60" cy="60" r="54" />
            {recording ? (
              <circle className="dictate-drain" cx="60" cy="60" r="54" />
            ) : null}
          </svg>

          <button
            type="button"
            onClick={recording ? onStop : onStart}
            disabled={reading}
            aria-label={
              recording ? "Detener la grabación" : "Grabar 7 segundos"
            }
            className="dictate-key"
          >
            {reading ? (
              <span className="dial size-[4.5rem]" aria-hidden="true" />
            ) : recording ? (
              <span className="flex flex-col items-center gap-2">
                <span className="display text-[3.25rem] leading-none tabular-nums">
                  {left}
                </span>
                <span className="flex h-6 items-end gap-[3px]">
                  {Array.from({ length: BARS }, (_, index) => (
                    <span
                      key={index}
                      ref={(node) => {
                        barsRef.current[index] = node;
                      }}
                      className="dictate-bar"
                    />
                  ))}
                </span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1.5">
                <Mic className="size-8" />
                <span className="display text-[1.75rem] leading-none tabular-nums">
                  7s
                </span>
              </span>
            )}
          </button>
        </div>

        <p className="max-w-[24ch] text-center text-[0.875rem] leading-relaxed text-[var(--text-2)]">
          {reading
            ? "Escuchando lo que dijiste…"
            : recording
              ? "Hablá ahora. Se corta solo al llegar a cero."
              : "Tocá y hablá. Son 7 segundos, ni uno más."}
        </p>

        {recording ? (
          <button
            type="button"
            onClick={onStop}
            className="key flex h-12 items-center gap-2 rounded-full px-6 text-[0.8125rem] text-[var(--text-2)]"
          >
            <Stop className="size-3.5" />
            Ya terminé
          </button>
        ) : null}

        {error ? (
          <div className="flex flex-col items-center gap-2">
            <p
              role="alert"
              className="max-w-[28ch] text-center text-[0.8125rem] text-[var(--danger)]"
            >
              {error}
            </p>
            {transcript ? (
              <p className="max-w-[28ch] text-center text-[0.75rem] text-[var(--text-3)]">
                Se escuchó: “{transcript}”
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Segundo acto: lo que se entendió.
 *
 * La transcripción va arriba y entre comillas porque es la explicación de
 * todo lo demás: si el monto quedó raro, ahí se ve si falló el oído o el
 * criterio. Y todo lo que la IA dedujo se puede corregir antes de guardar —
 * la voz llena el formulario, no lo reemplaza.
 */
function Review({
  draft,
  categories,
  baseCurrency,
  onAgain,
}: {
  draft: Extract<VoiceState, { status: "ready" }>;
  categories: PocketCategory[];
  baseCurrency: string;
  onAgain: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createTransaction,
    SAVE_INITIAL
  );
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");

  const options = categories.filter(
    (category) => category.kind === "expense" || category.kind === "both"
  );
  const chosen = options.find((category) => category.id === categoryId) ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value="expense" />
      {categoryId ? (
        <input type="hidden" name="category_id" value={categoryId} />
      ) : null}

      <section className="mt-2">
        <p className="eyebrow rise" style={{ "--d": "60ms" } as CSSProperties}>
          Te escuché
        </p>
        <p
          className="display rise mt-3 text-[clamp(1.375rem,6vw,1.75rem)] leading-[1.15] text-[var(--text-2)]"
          style={{ "--d": "100ms" } as CSSProperties}
        >
          “{draft.transcript}”
        </p>
      </section>

      <div className="rise" style={{ "--d": "160ms" } as CSSProperties}>
        <label className="field-label" htmlFor="voice-amount">
          Monto
        </label>
        <div className="groove flex items-end gap-3 px-4 py-4">
          <input
            id="voice-amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            defaultValue={draft.amount}
            className="display min-w-0 flex-1 bg-transparent text-[clamp(2.25rem,12vw,3.25rem)] tabular-nums outline-none"
          />
          <select
            name="currency"
            aria-label="Moneda"
            defaultValue={draft.currency}
            className="field w-[5.5rem] shrink-0 px-3 py-2.5 text-[0.8125rem]"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 px-1 text-[0.75rem] text-[var(--text-3)]">
          Se guarda convertido a {baseCurrency} al cambio del día.
        </p>
      </div>

      <div className="rise" style={{ "--d": "210ms" } as CSSProperties}>
        <label className="field-label" htmlFor="voice-description">
          En qué se fue
        </label>
        <input
          id="voice-description"
          name="description"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoComplete="off"
          defaultValue={draft.description}
          className="field"
        />
      </div>

      <div className="rise" style={{ "--d": "250ms" } as CSSProperties}>
        <label className="field-label" htmlFor="voice-category">
          Categoría
        </label>
        <div className="flex items-center gap-2">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--accent-ink)]">
            {categoryId ? (
              <CategoryIcon
                iconKey={chosen?.icon_key ?? draft.iconKey}
                className="size-[1.125rem]"
              />
            ) : (
              <Spark className="size-[1.125rem]" />
            )}
          </span>
          <select
            id="voice-category"
            className="field"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">
              {draft.categoryId === null && draft.categoryName
                ? `${draft.categoryName} · la crea la IA`
                : "Que la elija la IA"}
            </option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rise" style={{ "--d": "290ms" } as CSSProperties}>
        <label className="field-label" htmlFor="voice-date">
          Fecha
        </label>
        <input
          id="voice-date"
          name="occurred_at"
          type="date"
          defaultValue={draft.occurred_at}
          className="field tabular-nums"
        />
      </div>

      <div
        className="rise flex flex-col gap-3"
        style={{ "--d": "330ms" } as CSSProperties}
      >
        <button
          type="submit"
          disabled={pending}
          className="key key-accent h-14 w-full rounded-full text-[1rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Registrar egreso"}
        </button>

        <button
          type="button"
          onClick={onAgain}
          className="flex h-11 items-center justify-center text-[0.8125rem] text-[var(--text-3)]"
        >
          Grabar de nuevo
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
