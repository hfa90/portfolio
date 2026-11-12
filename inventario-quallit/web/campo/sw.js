// Service worker do app de conferência: abre sem internet.
// Os dados (Supabase) não passam por aqui — ficam no IndexedDB e sincronizam ao finalizar.
const VERSAO = 'campo-v10';
const ESSENCIAIS = [
  './', './index.html', './campo.css', './campo.js', './manifest.webmanifest',
  '../js/config.js', '../js/versao.js', '../js/offline.js', '../js/prazo.js', '../js/resumo.js', '../js/dialogos.js', '../css/prazo.css', '../img/logo.svg', '../img/cliente-rd.png',
  '../icons/icon-192.png', '../icons/icon-512.png', '../icons/apple-touch-icon.png',
];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('campo-') && k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// o app avisa quais bibliotecas carregou (supabase-js, fontes, leitor de QR) para guardar também
self.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'cachear') return;
  const urls = (e.data.urls || []).filter((u) => CDN.test(u));
  e.waitUntil(caches.open(VERSAO).then((c) => Promise.all(urls.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => c.add(u).catch(() => {}))))));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;
  if (CDN.test(req.url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
      return res;
    })));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
  }
});
