// marmita-sw.js — Service Worker para notificações Web Push
// Coloque este arquivo na RAIZ do seu servidor (mesma pasta do marmita.html)

const CACHE_NAME = "marmita-v1";
const ASSETS = ["/marmita.html", "/admin.html"];

// ── Instalação ──────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Ativação ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Push recebido (quando app está fechado) ──────────────────────────────────
self.addEventListener("push", event => {
  let payload = { title: "🍱 Marmita", body: "Você tem uma notificação.", icon: "/icon-192.png" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [100, 50, 100],
      data: payload.url ? { url: payload.url } : {},
      actions: payload.actions || []
    })
  );
});

// ── Clique na notificação ────────────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/marmita.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes("marmita") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
