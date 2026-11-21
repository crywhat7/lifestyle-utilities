import { Instrument_Sans } from "next/font/google";
import "./rooms.css";

/**
 * La voz del módulo y de nadie más.
 *
 * Instrument Sans se declara acá y no en el layout raíz: solo esta ruta la
 * usa, y cargarla en el hub sería pagar una fuente que nadie ve.
 *
 * Antes acá había una tipografía de píxeles, y decía "esto es un juego" antes
 * de que se leyera una palabra. El problema es que también decía "esto es una
 * maqueta": un inventario que se abre todos los días para buscar un cable se
 * lee cuarenta veces por cada vez que se disfruta, y los píxeles se cobran en
 * cada una de esas cuarenta. Instrument Sans es lo contrario — un grotesco
 * variable, de formas cerradas, que aguanta un titular de 56 px y una
 * etiqueta de 11 px con la misma voz. El carácter ahora lo pone la escala,
 * no el disfraz.
 */
const sans = Instrument_Sans({
  variable: "--font-index",
  subsets: ["latin"],
  display: "swap",
});

/**
 * La frontera del ambiente.
 *
 * Todo lo del módulo cuelga de `.rooms`, así que este envoltorio es lo único
 * que separa a Rooms Planning de la placa mecanizada del resto de la app:
 * los tokens nacen acá y mueren acá. El fondo también se pone acá y no en
 * cada pantalla, porque es el lugar donde ocurre todo y tiene que cubrir
 * hasta el último píxel.
 */
export default function RoomsLayout({ children }: LayoutProps<"/hub/rooms">) {
  return <div className={`rooms ${sans.variable} flex flex-1 flex-col`}>{children}</div>;
}
