/* Chamado Fácil — service worker (rede primeiro; cache só como reserva offline) */
const CACHE = 'chamadofacil-v1';
const BASE = ['./', 'index.html', 'app.html', 'terminal.html', 'etiquetas.html', 'css/style.css',
  'js/config.js', 'js/common.js', 'js/app.js', 'js/terminal.js', 'assets/marca.png', 'assets/logo-rd-escuro.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase e CDNs sempre direto
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
