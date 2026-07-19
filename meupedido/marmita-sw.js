// marmita-sw.js - Service Worker para PWA e Web Push

const CACHE_NAME = "marmita-v10";
const ASSETS_TO_CACHE = ["./marmita.html", "./admin.html", "./manifest.webmanifest", "./icon.svg"];

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

  if (event.request.destination === "document" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match("./marmita.html")))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

self.addEventListener("push", event => {
  let data = {
    title: "Marmita",
    body: "Voce tem uma notificacao.",
    icon: new URL("icon.svg", self.registration.scope).href,
    badge: new URL("icon.svg", self.registration.scope).href,
    url: "./marmita.html"
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
      tag: data.tag || "marmita-push",
      renotify: true,
      requireInteraction: data.requireInteraction !== false,
      timestamp: Date.now(),
      data: { url: data.url },
      actions: [
        { action: "abrir", title: "Abrir" },
        { action: "fechar", title: "Dispensar" }
      ]
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "fechar") return;

  const url = event.notification.data?.url || "./marmita.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const target = new URL(url, self.registration.scope);
      for (const client of list) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === target.pathname && "focus" in client) {
          client.postMessage({ type: "NOTIF_CLICK", url });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target.href);
    })
  );
});

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
