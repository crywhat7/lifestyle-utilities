import "./rooms.css";

/**
 * La frontera del ambiente.
 *
 * Todo lo de One UI cuelga de `.rooms`, así que este envoltorio es lo único
 * que separa a Rooms Planning de la placa mecanizada del resto de la app: los
 * tokens nacen acá y mueren acá. El fondo gris claro —o casi negro— también
 * se pone acá y no en cada pantalla, porque es el suelo del módulo y tiene
 * que cubrir hasta el último píxel de una lista que no llena la altura.
 */
export default function RoomsLayout({ children }: LayoutProps<"/hub/rooms">) {
  return <div className="rooms flex flex-1 flex-col">{children}</div>;
}
