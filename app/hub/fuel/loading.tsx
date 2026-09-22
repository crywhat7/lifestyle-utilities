/**
 * Fuel mientras llegan el plan y las comidas del día.
 *
 * El fogón se dibuja apagado en su tamaño exacto: cuando llegan los datos,
 * la brasa se enciende en el mismo lugar en vez de empujar la lista.
 */
export default function Loading() {
  return (
    <main className="relative flex flex-1 flex-col gap-6 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2.25rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="e-ghost h-10 w-24 rounded-full" />
        <span className="flex gap-2">
          <span className="e-ghost h-10 w-24 rounded-full" />
          <span className="e-ghost size-10 rounded-full" />
        </span>
      </header>

      <section className="flex flex-col items-center gap-5">
        <span className="e-ghost h-3 w-40 rounded-full" />
        <span className="e-ghost aspect-square w-[min(84vw,23rem)] rounded-full" />
        <span className="e-ghost h-4 w-32 rounded-full" />
      </section>

      <section className="grid grid-cols-3 gap-4">
        <span className="e-ghost h-14" />
        <span className="e-ghost h-14" />
        <span className="e-ghost h-14" />
      </section>

      <span className="e-ghost h-40" />
    </main>
  );
}
