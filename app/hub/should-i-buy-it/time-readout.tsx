"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { VERDICT_COPY, formatDuration, type Verdict } from "@/lib/money";

const EASE_EXPO = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** El precio se convierte en tiempo delante de tus ojos. */
function useCountUp(target: number, duration = 1150) {
  const [value, setValue] = useState(target);
  const frame = useRef<number>(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Sin animación el valor ya es el correcto desde el render inicial.
    if (reduced) return;

    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(target * EASE_EXPO(progress));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}

type Props = {
  hours: number;
  workDays: number;
  incomeShare: number;
  verdict: Verdict;
};

export function TimeReadout({ hours, workDays, incomeShare, verdict }: Props) {
  const animated = useCountUp(hours);
  const copy = VERDICT_COPY[verdict];
  const fill = Math.max(Math.min(incomeShare, 1), 0.02);
  const percent = Math.round(incomeShare * 100);

  return (
    <section className="plate relative overflow-hidden p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full opacity-50 blur-3xl"
        style={{ background: `radial-gradient(circle, ${copy.color}30, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <span
          className="chip"
          style={{ color: copy.color, borderColor: `${copy.color}44` }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: copy.color, boxShadow: `0 0 8px ${copy.color}` }}
          />
          {copy.label}
        </span>
        <span className="text-[0.6875rem] tracking-[0.18em] text-[var(--text-3)] uppercase">
          Te cuesta
        </span>
      </div>

      <p
        className="display relative mt-5 tabular-nums"
        style={{ fontSize: "clamp(3.25rem,19vw,4.75rem)", color: copy.color }}
        aria-label={`${formatDuration(hours)} de tu vida`}
      >
        {formatDuration(animated)}
      </p>
      <p className="relative mt-3 text-[0.9375rem] text-[var(--text-2)]">
        de tu vida trabajando.
      </p>

      {/* Medidor: cuánto del mes se lleva */}
      <div className="groove relative mt-7 h-3 overflow-hidden rounded-full p-0">
        <div
          className="gauge-fill h-full w-full rounded-full"
          style={
            {
              "--fill": fill,
              background: `linear-gradient(90deg, ${copy.color}55, ${copy.color})`,
              boxShadow: `0 0 14px ${copy.color}55`,
            } as CSSProperties
          }
        />
      </div>

      <div className="relative mt-3 flex items-baseline justify-between text-[0.75rem] text-[var(--text-3)]">
        <span>
          <span className="text-[var(--text-2)] tabular-nums">{percent}%</span>{" "}
          de tu ingreso del mes
        </span>
        <span>
          <span className="text-[var(--text-2)] tabular-nums">
            {workDays.toFixed(1)}
          </span>{" "}
          días laborales
        </span>
      </div>

      <p className="relative mt-5 border-t border-white/6 pt-4 text-[0.8125rem] leading-relaxed text-[var(--text-2)]">
        {copy.note}
      </p>
    </section>
  );
}
