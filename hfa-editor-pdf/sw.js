// Service worker: deixa o editor funcionando offline.
// Troque VERSION a cada publicação para os navegadores baixarem a versão nova.
const VERSION = 'hfa-v2.0.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'src/main.js', 'src/util.js', 'src/state.js', 'src/history.js', 'src/pdf.js', 'src/render.js', 'src/elements.js',
  'src/select.js', 'src/textedit.js', 'src/panel.js', 'src/media.js', 'src/export.js', 'src/autosave.js',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'vendor/pdf-lib/pdf-lib.esm.min.js',
  'vendor/fonts/fonts.css',
  'vendor/fonts/inter-latin-wght-normal.woff2', 'vendor/fonts/inter-latin-ext-wght-normal.woff2',
  'vendor/fonts/caveat-latin-600-normal.woff2', 'vendor/fonts/dancing-script-latin-600-normal.woff2',
  'vendor/fonts/great-vibes-latin-400-normal.woff2', 'vendor/fonts/satisfy-latin-400-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hfa-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// vendor/ muda só com a versão: cache primeiro (cmaps, fontes padrão, DejaVu e
// fontkit entram no cache na primeira vez que forem usados).
// O resto: devolve o cache na hora e atualiza em segundo plano.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; } catch (err) {
      if (req.mode === 'navigate') { const shell = await c.match('index.html'); if (shell) return shell; }
      throw err;
    }
  }));
});
