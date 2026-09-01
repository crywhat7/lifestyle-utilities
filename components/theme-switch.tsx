"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Auto, Moon, Sun } from "@/components/icons";
import {
  THEME_CHOICES,
  THEME_COLOR,
  THEME_KEY,
  isThemeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

const OPTIONS: {
  choice: ThemeChoice;
  label: string;
  Glyph: (props: { className?: string }) => React.ReactElement;
}[] = [
  { choice: "light", label: "Tema claro", Glyph: Sun },
  { choice: "auto", label: "Seguir al sistema", Glyph: Auto },
  { choice: "dark", label: "Tema oscuro", Glyph: Moon },
];

/* --------------------------------------------------------------------------
   La elección no vive en React: vive en `localStorage` y en el atributo del
   `<html>`, porque el script de arranque ya la escribió antes de que React
   existiera. Copiarla a un `useState` sería tener dos fuentes de verdad y
   una carrera entre ellas, así que acá React solo se suscribe.
   -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Otra pestaña del mismo origen también puede cambiar el tema.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isThemeChoice(stored) ? stored : "auto";
  } catch {
    // Navegación privada con almacenamiento bloqueado: queda en automático.
    return "auto";
  }
}

/** En el servidor no hay elección posible: automático es la única respuesta honesta. */
function serverChoice(): ThemeChoice {
  return "auto";
}

/** Lo que el sistema pide ahora mismo. */
function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Marca del `<meta>` que este componente sí puede tocar. */
const OWN_META = "data-lu-theme-color";

/**
 * La barra del navegador no lee CSS: hay que decirle el color a mano, o en
 * el tema claro queda una franja negra arriba de una pantalla de papel.
 *
 * Los dos `<meta name="theme-color">` con `media` los pone `viewport` en el
 * layout raíz, así que son de React y NO se tocan. Antes esta función los
 * borraba a todos: React se quedaba con referencias a nodos sin padre y en la
 * siguiente navegación —cuando reconcilia el metadata de la ruta nueva—
 * reventaba con `removeChild` de null. La app quedaba congelada con la URL ya
 * cambiada, y recién el segundo toque la movía, porque para entonces React
 * estaba muerto y el enlace navegaba como un `<a>` cualquiera.
 *
 * Este mete uno propio, marcado, y lo reusa. Va al principio del `<head>`
 * porque el navegador se queda con el primer `theme-color` cuyo `media`
 * aplique: sin `media`, aplica siempre, y así le gana a los dos de React sin
 * necesidad de sacarlos del documento.
 */
function paintBrowserChrome(resolved: ResolvedTheme) {
  let meta = document.head.querySelector<HTMLMetaElement>(
    `meta[${OWN_META}]`
  );

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute(OWN_META, "");
    document.head.prepend(meta);
  }

  meta.content = THEME_COLOR[resolved];
}

/**
 * Selector de tema: claro, automático, oscuro.
 *
 * Un riel hundido con una sola tecla que se desliza — el mismo objeto que
 * las pestañas de My Pocket, encogido a tamaño de header. Tres celdas, tres
 * estados, y el que está puesto se lee sin leer: la tecla está ahí.
 *
 * Dónde está la tecla y cuál glifo se enciende lo decide el CSS mirando
 * `html[data-theme]`, no este componente: así el primer pintado ya sale
 * correcto y nada se ve saltar cuando React hidrata.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice);
  const railRef = useRef<HTMLDivElement>(null);

  // En automático el sistema puede cambiar solo (atardecer, horario de
  // Windows). El atributo no se toca —seguir vacío ES el automático— pero la
  // barra del navegador sí tiene que acompañar.
  useEffect(() => {
    const resolved = choice === "auto" ? systemTheme() : choice;
    paintBrowserChrome(resolved);

    if (choice !== "auto") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => paintBrowserChrome(systemTheme());
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [choice]);

  const pick = useCallback((next: ThemeChoice) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // La elección vale para esta sesión aunque no se pueda guardar.
    }

    const root = document.documentElement;

    // El cruce entre temas dura lo que dura: se enciende la transición
    // global, se cambia el atributo, y se apaga. Dejarla viva le pondría
    // inercia a cada hover del resto de la app.
    root.classList.add("theme-shift");
    window.setTimeout(() => root.classList.remove("theme-shift"), 420);

    // Ausencia de atributo = automático, que es lo que el CSS ya sabe leer.
    if (next === "auto") delete root.dataset.theme;
    else root.dataset.theme = next;

    listeners.forEach((notify) => notify());
  }, []);

  /**
   * Flechas dentro del grupo, como manda un radiogroup: el foco no sale del
   * riel hasta que se sale con Tab.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;

    event.preventDefault();
    const index = THEME_CHOICES.indexOf(choice);
    const next =
      THEME_CHOICES[
        (index + step + THEME_CHOICES.length) % THEME_CHOICES.length
      ];

    pick(next);
    railRef.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [THEME_CHOICES.indexOf(next)]?.focus();
  };

  return (
    <div
      ref={railRef}
      role="radiogroup"
      aria-label="Tema de la interfaz"
      onKeyDown={onKeyDown}
      className={`theme-switch w-[7.25rem] ${className ?? ""}`}
    >
      <span className="theme-thumb" aria-hidden="true" />

      {OPTIONS.map(({ choice: option, label, Glyph }) => (
        <button
          key={option}
          type="button"
          role="radio"
          data-choice={option}
          aria-checked={option === choice}
          aria-label={label}
          title={label}
          // Solo el elegido entra en el orden de tabulación: el grupo es una
          // parada, no tres.
          tabIndex={option === choice ? 0 : -1}
          onClick={() => pick(option)}
          className="theme-opt"
        >
          <Glyph className="size-[0.9375rem]" />
        </button>
      ))}
    </div>
  );
}
