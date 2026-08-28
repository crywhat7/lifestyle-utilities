/**
 * Service worker de Lifestyle Utilities.
 *
 * Su único trabajo es recibir pushes y abrir la app donde corresponde. No
 * cachea nada a propósito: el saldo que ves tiene que ser el de la base, no
 * uno guardado hace tres días.
 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "My Pocket";
  const url = payload.url || "/hub/my-pocket";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon",
      badge: "/icon",
      // Un tag por tipo de aviso: dos pagos el mismo día no apilan dos globos.
      tag: payload.tag || "pocket",
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Si la app ya está abierta se reutiliza esa ventana en vez de abrir otra.
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
