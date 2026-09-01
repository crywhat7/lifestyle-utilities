import "./glass.css";

/**
 * La frontera del ambiente.
 *
 * Todo lo de vidrio cuelga de `.glass`, así que este envoltorio es lo único
 * que separa a Clean Daily del sistema mecanizado del resto de la app: los
 * tokens nacen acá y mueren acá. `.sky` es fija y cubre la pantalla entera
 * —no solo la columna de 30rem— porque la aurora es el suelo del módulo, no
 * un fondo de tarjeta.
 */
export default function CleanDailyLayout({
  children,
}: LayoutProps<"/hub/clean-daily">) {
  return (
    <div className="glass flex flex-1 flex-col">
      <div aria-hidden="true" className="sky" />
      {children}
    </div>
  );
}
