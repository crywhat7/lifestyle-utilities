/**
 * Rooms mientras llega el árbol.
 *
 * Los huesos tienen la altura exacta de las filas reales: cuando llegan los
 * datos, la lista se rellena en el mismo lugar en vez de empujar el pie y
 * mover el botón justo cuando el pulgar ya iba bajando.
 */
export default function Loading() {
  return (
    <main className="relative flex flex-1 flex-col gap-4 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center">
        <span className="r-ghost h-11 w-24 rounded-full" />
      </header>

      <section className="flex flex-col gap-3">
        <span className="r-ghost h-8 w-48 rounded-xl" />
        <span className="r-ghost h-4 w-60 rounded-full" />
      </section>

      <ul className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <li key={row} className="r-ghost h-[4.75rem] rounded-[26px]" />
        ))}
      </ul>
    </main>
  );
}
