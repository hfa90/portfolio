/* Service worker antigo do RH+ Match (escopo /rhmais/). O sistema mudou para /rhmais/sistema/, com service worker
   próprio; este aqui só se desinstala para não ficar controlando a página inicial com arquivos velhos. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => /^rhmais-v\d+$/.test(k)).map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
