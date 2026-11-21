"use client";

import { useState } from "react";
import { Check, Download, Share } from "@/components/icons";

/**
 * Mandar el camino.
 *
 * Dos salidas, y las dos hacen falta porque son para dos personas distintas.
 * El enlace es para quien también usa esto: abre la pantalla viva, con los
 * pasos navegables. El PDF es para todos los demás —alguien en la casa,
 * alguien que viene a buscar algo mientras no estás— que no tienen cuenta
 * acá y a quienes un enlace no les sirve de nada.
 *
 * `navigator.share` abre la hoja del sistema y de ahí sale por WhatsApp o por
 * donde sea. Donde no existe —escritorio, casi siempre— se copia el enlace y
 * se dice que se copió, que es lo que la persona iba a hacer igual.
 */
export function ShareTrail({ item, pdf }: { item: string; pdf: string }) {
  const [copied, setCopied] = useState(false);

  async function send() {
    const url = window.location.href;
    const title = `Dónde está ${item}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch {
        // Cancelar no es un error: no hay nada que decir.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Sin portapapeles no queda nada que ofrecer: el enlace está en la barra.
    }
  }

  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => void send()} className="r-key flex-1 gap-2">
        {copied ? <Check className="size-[1.125rem]" /> : <Share className="size-[1.125rem]" />}
        {copied ? "Enlace copiado" : "Compartir"}
      </button>

      {/* La dirección la pone el servidor: leer `window` al dibujar rompe el
          render del servidor, y este botón existe desde el primer pintado. */}
      <a href={pdf} className="r-key r-key-lit flex-1 gap-2">
        <Download className="size-[1.125rem]" />
        PDF
      </a>
    </div>
  );
}
