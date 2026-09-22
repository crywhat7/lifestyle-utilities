import { Fraunces } from "next/font/google";
import "./ember.css";

/**
 * La voz de Fuel y de nadie más.
 *
 * Fraunces se declara acá y no en el layout raíz: solo este módulo la usa, y
 * cargarla en el hub sería pagar una fuente que nadie ve. Se pide variable
 * con sus ejes de suavidad (`SOFT`) y de tamaño óptico (`opsz`), que son los
 * que hacen que la cifra gigante se sienta escrita con tiza y no impresa.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

/**
 * La frontera del ambiente: todo lo de brasa cuelga de `.ember`, así que
 * este envoltorio es lo único que separa a Fuel del resto de la app.
 */
export default function FuelLayout({ children }: LayoutProps<"/hub/fuel">) {
  return <div className={`ember ${fraunces.variable} flex flex-1 flex-col`}>{children}</div>;
}
