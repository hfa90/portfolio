// Endereço antigo: apaga a cópia do sistema guardada no aparelho e sai de cena (o sistema agora está em haydenfernandes.tech/inventario).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
})()));
