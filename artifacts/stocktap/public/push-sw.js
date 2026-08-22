// Push handlers, imported into the Workbox-generated service worker via
// vite-plugin-pwa workbox.importScripts. Keep this dependency-free.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "StockTap", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "StockTap";
  const options = {
    body: data.body || "",
    icon: data.icon || "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: data.tag || undefined, // same tag collapses duplicates
    data: { url: data.url || "/" },
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, else open a new one.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
