// Service worker: guarda os arquivos do painel para abrir e conferir sem internet.
// Os dados (Supabase) não passam por aqui: o app guarda no IndexedDB e sincroniza sozinho.
const VERSAO = 'iq-v4';
const ESSENCIAIS = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/config.js', './js/offline.js', './js/assinatura.js', './js/etiquetas.js',
  './icons/icon-192.png', './icons/icon-512.png', './img/logo.svg',
];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// o app manda a lista de bibliotecas que carregou (supabase-js, fontes, QR…) para guardar também
self.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'cachear') return;
  const urls = (e.data.urls || []).filter((u) => CDN.test(u));
  e.waitUntil(caches.open(VERSAO).then((c) => Promise.all(urls.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => c.add(u).catch(() => {}))))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // dados: sempre rede

  // bibliotecas de CDN: cache primeiro (versões fixas, não mudam)
  if (CDN.test(req.url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
      return res;
    })));
    return;
  }

  // arquivos do próprio site: rede primeiro (pega atualizações), cache se estiver offline
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
        return res;
      }).catch(async () => (await caches.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    );
  }
});
