// marmita-sw.js — Service Worker para Web Push
// Coloque na RAIZ do servidor (mesma pasta do marmita.html)

const CACHE_NAME = "marmita-v2";
const ASSETS_TO_CACHE = ["/marmita.html", "/admin.html", "/icon-192.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE).catch(() => { }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// Push recebido (app fechado ou em background)
self.addEventListener("push", event => {
  let data = {
    title: "🍱 Marmita",
    body: "Você tem uma notificação.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    url: "/marmita.html"
  };
  try {
    const parsed = event.data?.json();
    data = { ...data, ...parsed };
  } catch {
    if (event.data?.text()) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: [100, 50, 100, 50, 100],
      tag: "marmita-push",
      renotify: true,
      data: { url: data.url },
      actions: [
        { action: "abrir", title: "📲 Abrir" },
        { action: "fechar", title: "Dispensar" }
      ]
    })
  );
});

// Clique na notificação
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "fechar") return;
  const url = event.notification.data?.url || "/marmita.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes("marmita") && "focus" in client) {
          client.postMessage({ type: "NOTIF_CLICK", url });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Re-subscribe quando o browser rotaciona a chave VAPID
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey
    }).then(newSub => {
      return clients.matchAll({ type: "window" }).then(list => {
        list.forEach(c => c.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED", sub: newSub.toJSON() }));
      });
    })
  );
});