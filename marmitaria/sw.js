// =========================================================
// Marmita Control — service worker (PWA)
// - Arquivos do app: busca na internet primeiro e guarda cópia;
//   sem internet, abre a cópia guardada.
// - Dados do Supabase: NUNCA ficam guardados aqui (sempre ao vivo).
// Ao publicar uma versão nova, mude VERSAO.
// =========================================================
const VERSAO = 'marmita-v2.3';
const ARQUIVOS = [
  './', 'index.html', 'style.css', 'mobile.css', 'config.js', 'manifest.webmanifest',
  'app.js', 'app-vendas.js', 'app-fiado.js', 'app-clientes.js', 'app-produtos.js', 'app-financeiro.js', 'app-mobile.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO)
    .then(c => Promise.all(ARQUIVOS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase (dados, login): sempre direto da internet
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  // login Microsoft e outros sites: não interfere
  const cdn = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (url.origin !== self.location.origin && !cdn) return;

  if (cdn) { // bibliotecas e fontes com versão fixa: cópia guardada primeiro
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
      return res;
    })));
    return;
  }

  e.respondWith(fetch(req).then(res => {
    if (res.ok && !url.search) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
