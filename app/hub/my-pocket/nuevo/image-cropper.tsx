"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** El recorte vive en fracciones de la imagen: sobrevive a cualquier tamaño. */
export type Crop = { x: number; y: number; w: number; h: number };

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
/** Menos que esto ya no contiene una fila legible. */
const MIN = 0.08;
/** Lo que se le manda a la IA: más resolución no le hace leer mejor. */
const MAX_EDGE = 1600;

type Corner = "nw" | "ne" | "sw" | "se";
type Drag =
  | { mode: "move"; startX: number; startY: number; from: Crop }
  | { mode: Corner };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Recorte del que se manda a leer.
 *
 * Una captura del banco casi nunca es toda del interés de quien la sube: hay
 * un encabezado, un saldo y quince movimientos de los que solo tres importan.
 * Recortar antes de que la IA lea es lo que convierte "registrá todo lo que
 * salga" en "registrá esto", y de paso abarata cada lectura.
 *
 * Las esquinas se arrastran, el marco entero se mueve, y lo de afuera se
 * apaga en vez de desaparecer: hay que seguir viendo qué se está dejando.
 */
export function ImageCropper({
  src,
  crop,
  onChange,
}: {
  src: string;
  crop: Crop;
  onChange: (crop: Crop) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const point = useCallback((event: { clientX: number; clientY: number }) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      x: clamp((event.clientX - box.left) / box.width, 0, 1),
      y: clamp((event.clientY - box.top) / box.height, 0, 1),
    };
  }, []);

  const start = (event: ReactPointerEvent, drag: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    // Capturar el puntero es lo que deja seguir arrastrando aunque el dedo
    // se salga del marco. No siempre se puede, y no es motivo para no mover.
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {}
    dragRef.current = drag;
    setDragging(true);
  };

  const move = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const at = point(event);
    if (!at) return;

    if (drag.mode === "move") {
      const dx = at.x - drag.startX;
      const dy = at.y - drag.startY;
      onChange({
        ...drag.from,
        x: clamp(drag.from.x + dx, 0, 1 - drag.from.w),
        y: clamp(drag.from.y + dy, 0, 1 - drag.from.h),
      });
      return;
    }

    // Cada esquina mueve dos bordes; los otros dos se quedan clavados.
    const left = crop.x;
    const top = crop.y;
    const right = crop.x + crop.w;
    const bottom = crop.y + crop.h;

    const nextLeft = drag.mode.includes("w") ? Math.min(at.x, right - MIN) : left;
    const nextTop = drag.mode.includes("n") ? Math.min(at.y, bottom - MIN) : top;
    const nextRight = drag.mode.includes("e")
      ? Math.max(at.x, left + MIN)
      : right;
    const nextBottom = drag.mode.includes("s")
      ? Math.max(at.y, top + MIN)
      : bottom;

    onChange({
      x: nextLeft,
      y: nextTop,
      w: nextRight - nextLeft,
      h: nextBottom - nextTop,
    });
  };

  const end = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    /* El marco lleva un margen interno para que las esquinas —que sobresalen
       medio dedo hacia afuera— no queden cortadas cuando el recorte abarca
       la imagen entera. */
    <div className="crop-frame">
      <div
        ref={frameRef}
        className="crop-stage"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Captura por recortar"
          draggable={false}
          className="block w-full select-none"
        />

        <div
          className="crop-window"
          data-dragging={dragging ? "true" : "false"}
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.w * 100}%`,
            height: `${crop.h * 100}%`,
          }}
          onPointerDown={(event) => {
            const at = point(event);
            if (!at) return;
            start(event, {
              mode: "move",
              startX: at.x,
              startY: at.y,
              from: crop,
            });
          }}
        >
          {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
            <span
              key={corner}
              role="presentation"
              className="crop-grip"
              data-corner={corner}
              onPointerDown={(event) => start(event, { mode: corner })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Convierte el recorte en el archivo que viaja al servidor.
 *
 * `createImageBitmap` con `from-image` es lo que respeta el EXIF: una foto
 * tomada de lado se ve derecha en pantalla, y sin esto el canvas la volvería
 * a acostar justo antes de mandarla a leer.
 */
export async function cropToFile(file: File, crop: Crop): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  const sx = Math.round(crop.x * bitmap.width);
  const sy = Math.round(crop.y * bitmap.height);
  const sw = Math.max(1, Math.round(crop.w * bitmap.width));
  const sh = Math.max(1, Math.round(crop.h * bitmap.height));

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("sin canvas");

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86)
  );

  if (!blob) throw new Error("sin blob");

  return new File([blob], "captura.jpg", { type: "image/jpeg" });
}

export { FULL as FULL_CROP };
