/**
 * El contrato del tema, en un solo lugar.
 *
 * Hay tres piezas que tienen que coincidir o el usuario ve un parpadeo:
 * el script que corre antes del primer pintado, el CSS que lee
 * `[data-theme]` y el selector que escribe la elección. Las tres importan
 * de acá.
 */

export type ThemeChoice = "light" | "dark" | "auto";

/** Lo que efectivamente se ve, ya resuelto el "auto". */
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "lu:theme";

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "auto", "dark"];

/**
 * El color de la barra del navegador y del splash de la PWA. Tiene que ser
 * el `--void` de cada tema: cualquier otra cosa deja una franja que no
 * pertenece a la pantalla.
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#e9e7dd",
  dark: "#08090b",
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "auto";
}

/**
 * Corre en el `<head>`, bloqueando, antes de que se pinte un solo píxel.
 *
 * Sin esto la app arranca en el tema del sistema y salta al elegido cuando
 * hidrata React: un flash blanco en la cara de alguien que pidió oscuro
 * explícitamente. Es un tirón feo y no hay forma de arreglarlo después.
 *
 * "auto" no escribe nada a propósito: la ausencia del atributo ES el
 * automático, y el CSS ya sabe seguir al sistema en ese caso.
 */
export const THEME_BOOT_SCRIPT = `
try {
  var choice = localStorage.getItem(${JSON.stringify(THEME_KEY)});
  if (choice === "light" || choice === "dark") {
    document.documentElement.dataset.theme = choice;
  }
} catch (e) {}
`.trim();
