import "./studio.css";

/**
 * La frontera del ambiente.
 *
 * Todo el papel blanco cuelga de `.studio`, así que este envoltorio es lo
 * único que separa a Canvas Studio del sistema mecanizado del resto de la
 * app. Los tokens nacen acá y mueren acá.
 */
export default function CanvasLayout({ children }: LayoutProps<"/hub/canvas">) {
  return <div className="studio flex flex-1 flex-col">{children}</div>;
}
