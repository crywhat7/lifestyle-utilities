import type { CSSProperties } from "react";

/** El papel en blanco, con las medidas de la pantalla real. */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="h-11" />
      <div className="mt-14 flex flex-col gap-4">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="s-rise block rounded-[18px] bg-[var(--s-surface)]"
            style={
              {
                "--d": `${index * 90}ms`,
                height: index === 0 ? "9rem" : "4.5rem",
              } as CSSProperties
            }
          />
        ))}
      </div>
    </main>
  );
}
