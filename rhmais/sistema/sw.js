/* RH+ Match — service worker do sistema (escopo /rhmais/sistema/).
   - Arquivos do app (inclui ../config.js, ../icons e ../supabase/.../nucleo.js): rede primeiro, cache como reserva offline.
   - Bibliotecas do CDN (URLs com versão fixa): cache primeiro.
   - Supabase (dados, login, funções) nunca passa pelo cache. */
const VERSAO = "rhmais-sistema-v2";
const SHELL = ["./", "./index.html", "./app.js", "./js/base.js", "./js/curriculos.js", "./js/admin.js", "./js/vagas.js", "./style.css", "./manifest.webmanifest",
  "../config.js", "../supabase/functions/_shared/nucleo.js", "../icons/icon-192.png", "../icons/apple-touch-icon.png"];
// pasta do site como um todo (/rhmais/): o sistema usa arquivos de fora do próprio escopo
const RAIZ = new URL("../", self.registration.scope).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("rhmais-") && k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;                // dados: sempre online
  if (url.hostname === "cdn.jsdelivr.net") {                       // libs versionadas
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return resp;
    })));
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith(RAIZ)) return;
  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
    return resp;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html"))));
});
