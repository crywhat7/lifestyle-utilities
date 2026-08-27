/** Indicador de carga: un dial mecanizado con la aguja barriendo. */
export function Dial({
  label,
  hint,
  size = "size-20",
}: {
  label: string;
  hint?: string;
  size?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-5 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className={`dial ${size}`} />
      <div>
        <p className="display text-[1.25rem]">{label}</p>
        {hint ? (
          <p className="mx-auto mt-2 max-w-[17rem] text-[0.8125rem] leading-relaxed text-[var(--text-3)]">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
