"use client";

import { useEffect, useRef, useState } from "react";
import { formatKcal } from "@/lib/fuel";

/**
 * Una cifra que llega contando.
 *
 * Cuando se registra una comida, el número del fogón no salta: baja (o sube)
 * hasta su nuevo valor en poco menos de un segundo. Es la diferencia entre
 * leer "640" y ver cómo 640 calorías se restan de lo que te quedaba.
 *
 * El primer render es el valor final —así el HTML del servidor y el del
 * navegador coinciden— y solo los cambios posteriores se animan. Con
 * movimiento reducido, no se anima nada.
 */
export function CountUp({
  value,
  from,
  duration = 900,
  className,
}: {
  value: number;
  /** Desde dónde arrancar la primera vez (si no, el primer render no anima). */
  from?: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);

  useEffect(() => {
    const start = current.current;
    if (start === value) return;

    // Con movimiento reducido el salto es de un solo cuadro.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const span = still ? 0 : duration;

    let frame = 0;
    const began = performance.now();

    function tick(now: number) {
      const t = span === 0 ? 1 : Math.min(1, (now - began) / span);
      // Expo out: arranca rápido y se asienta, como todo lo demás del módulo.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const next = start + (value - start) * eased;
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className={className}>{formatKcal(shown)}</span>;
}
