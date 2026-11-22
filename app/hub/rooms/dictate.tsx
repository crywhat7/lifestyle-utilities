"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Mic, Stop } from "@/components/icons";
import { readSpokenName, type HeardState } from "./voice-actions";

/**
 * Seis segundos. El nombre de una cosa son dos o tres palabras —"sudadera
 * gris", "cable HDMI de dos metros"— y todo lo que pase de ahí es alguien
 * describiendo el objeto en vez de nombrarlo, que es justo lo que no cabe en
 * una lista de trescientas filas.
 */
const LIMIT_MS = 6_000;

const IDLE: HeardState = { status: "idle" };

/** El primero que soporte el navegador. Safari solo da mp4; Chrome, webm. */
const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIMES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
}

/**
 * Decir el nombre en vez de escribirlo.
 *
 * Quien está vaciando una gaveta tiene las dos manos ocupadas y el teléfono
 * apoyado: escribir "cargador de laptop Dell" con el pulgar de la mano que
 * sostiene el cargador es la parte del alta que hace abandonar el inventario
 * a los veinte objetos. Dictar lo vuelve una frase.
 *
 * El dictado NO guarda: deja la frase en el campo y ahí se queda, editable.
 * Un nombre mal oído que se guarda solo es una cosa que no se vuelve a
 * encontrar nunca, y el inventario entero existe para encontrar cosas.
 *
 * El audio viaja al servidor y vuelve como texto —es el mismo camino que usa
 * el dictado de egresos, Whisper detrás— en vez del reconocimiento del
 * navegador, que en iOS entiende mucho peor el español de acá y en algunos
 * navegadores simplemente no existe.
 */
export function DictateKey({ onHeard }: { onHeard: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(LIMIT_MS / 1000);
  const [error, setError] = useState<string | null>(null);
  const [reading, run] = useTransition();

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const clock = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopper = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Todo lo que hay que soltar: el micro se apaga apenas deja de hacer falta. */
  const teardown = useCallback(() => {
    if (clock.current !== null) clearInterval(clock.current);
    if (stopper.current !== null) clearTimeout(stopper.current);
    clock.current = null;
    stopper.current = null;

    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  async function start() {
    setError(null);

    try {
      const live = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = live;

      const mime = pickMime();
      const tape = new MediaRecorder(live, mime ? { mimeType: mime } : {});
      recorder.current = tape;

      const chunks: Blob[] = [];
      tape.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      tape.onstop = () => {
        const type = tape.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        /* La extensión importa: el transcriptor la mira para decodificar. */
        const name = type.includes("mp4") ? "nombre.mp4" : "nombre.webm";

        teardown();
        setRecording(false);
        setLeft(LIMIT_MS / 1000);

        if (blob.size < 1_000) {
          setError("Fue muy corto. Tocá y decilo completo.");
          return;
        }

        const body = new FormData();
        body.append("audio", new File([blob], name, { type }));

        run(async () => {
          const result = await readSpokenName(IDLE, body);
          if (result.status === "heard") {
            onHeard(result.text);
            return;
          }
          if (result.status === "error") setError(result.error);
        });
      };

      const began = performance.now();
      let shown = LIMIT_MS / 1000;

      /* El contador tiene su propio reloj: el micro sigue abierto aunque la
         pantalla se vaya al fondo, y el número que dice cuánto falta no puede
         congelarse mientras eso pasa. */
      const count = () => {
        const next = Math.ceil(Math.max(0, (LIMIT_MS - (performance.now() - began)) / 1000));
        if (next === shown) return;
        shown = next;
        setLeft(next);
      };

      tape.start();
      setRecording(true);
      setLeft(LIMIT_MS / 1000);
      clock.current = setInterval(count, 200);

      /* El corte duro vive acá y no en el `onstop`: pase lo que pase con la
         interfaz, a los seis segundos el micro se apaga. */
      stopper.current = setTimeout(() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
      }, LIMIT_MS);
    } catch {
      teardown();
      setRecording(false);
      setError("No se pudo usar el micrófono. Revisá el permiso del navegador.");
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (recording ? stop() : void start())}
        disabled={reading}
        className="r-mic"
        data-on={recording}
        aria-label={recording ? "Dejar de dictar" : "Dictar el nombre"}
      >
        {recording ? <Stop className="size-[1.125rem]" /> : <Mic className="size-[1.25rem]" />}
      </button>

      {/* El estado se dice con palabras y no solo con el botón latiendo: "está
          oyendo" y "está pensando" son dos esperas distintas, y la segunda no
          se arregla hablando más fuerte. */}
      {recording || reading || error ? (
        <p className={error ? "r-alert mt-2" : "r-hint mt-2"} role={error ? "alert" : "status"}>
          {error ?? (recording ? `Escuchando… ${left}` : "Pasando a texto…")}
        </p>
      ) : null}
    </>
  );
}
