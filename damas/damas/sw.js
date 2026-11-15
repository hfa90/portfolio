// Service worker: app funciona offline (modo máquina e 2 jogadores) e abre instantâneo
const VERSION = 'jogos-v2';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/engine.js', './js/ai-worker.js', './js/net.js', './js/fx.js', './js/config.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './corrida/', './corrida/index.html', './corrida/race.css', './corrida/js/main.js', './corrida/js/tracks.js', './corrida/js/physics.js',
  './corrida/js/world.js', './corrida/js/audio.js', './corrida/js/net.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cdn = url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !cdn) return;
  // stale-while-revalidate
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = req.mode === 'navigate' ? (url.pathname.includes('/corrida/') ? './corrida/index.html' : './index.html') : req;
      const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
