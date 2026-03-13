// Quallit IT Field — Service Worker
// Estratégia: Cache First para assets, Network First para dados, Queue para validações offline

const SW_VERSION = 'quallit-field-v1';
const STATIC_CACHE = SW_VERSION + '-static';
const DATA_CACHE   = SW_VERSION + '-data';

// Assets a cachear imediatamente no install
const STATIC_ASSETS = [
  './quallit-field.html',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
];

// ── Install: pré-cacheia assets estáticos ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== DATA_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estratégia por tipo de request ────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase REST — Network First, fallback ao cache de dados
  if (url.hostname.includes('supabase') && url.pathname.includes('/rest/')) {
    event.respondWith(networkFirstData(event.request));
    return;
  }

  // jsQR CDN — Cache First (não muda)
  if (url.hostname.includes('jsdelivr') || url.hostname.includes('unpkg') || url.hostname.includes('cdnjs')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML do app — Network First, fallback ao cache estático
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstStatic(event.request));
    return;
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstData(request) {
  // Só cacheia GETs de dados
  if (request.method !== 'GET') {
    try { return await fetch(request); } catch { return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }); }
  }
  try {
    const response = await fetch(request);
    const cache = await caches.open(DATA_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

// ── Background Sync: processa fila offline quando volta online ────────
self.addEventListener('sync', event => {
  if (event.tag === 'quallit-sync-validacoes') {
    event.waitUntil(syncValidacoes());
  }
});

async function syncValidacoes() {
  // Notifica o cliente para processar a fila
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'SYNC_VALIDACOES' }));
}

// ── Push: receber notificações (opcional) ────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
