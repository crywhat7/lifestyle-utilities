import { Pixelify_Sans } from "next/font/google";
import "./rooms.css";

/**
 * La voz del módulo y de nadie más.
 *
 * Pixelify Sans se declara acá y no en el layout raíz: solo esta ruta la
 * usa, y cargarla en el hub sería pagar una fuente que nadie ve. Es la que
 * dice "esto es un juego" antes de que se lea una palabra — y es de píxeles
 * pero con formas de sans, así que un rótulo en castellano con tildes y eñes
 * se sigue leyendo. Una tipografía de arcade de verdad no sobrevive a
 * "Gavetas y repisas".
 */
const pixel = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
  display: "swap",
});

/**
 * La frontera del ambiente.
 *
 * Todo lo del juego cuelga de `.rooms`, así que este envoltorio es lo único
 * que separa a Rooms Planning de la placa mecanizada del resto de la app:
 * los tokens nacen acá y mueren acá. El fondo —el aire del anochecer y las
 * luciérnagas— también se pone acá y no en cada pantalla, porque es el lugar
 * donde ocurre todo y tiene que cubrir hasta el último píxel.
 */
export default function RoomsLayout({ children }: LayoutProps<"/hub/rooms">) {
  return <div className={`rooms ${pixel.variable} flex flex-1 flex-col`}>{children}</div>;
}
