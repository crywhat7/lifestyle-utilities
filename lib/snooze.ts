/**
 * "Ahora no", recordado.
 *
 * Los avisos que la app se permite mostrar sin que nadie los pida —instalar,
 * encender las notificaciones— tienen que poder callarse. El navegador es el
 * único que sabe si esta persona ya dijo que no, así que vive en su
 * `localStorage` y no en la base: es una preferencia de este aparato.
 *
 * Todo va envuelto en try/catch porque en modo privado el acceso tira, y un
 * banner que revienta la pantalla por no poder guardar un "no" es absurdo.
 */

export function snooze(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Sin almacenamiento el silencio dura lo que dure esta pantalla.
  }
}

export function isSnoozed(key: string, days: number) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    const at = Number(raw);
    if (!Number.isFinite(at)) return false;

    return Date.now() - at < days * 86_400_000;
  } catch {
    return false;
  }
}
