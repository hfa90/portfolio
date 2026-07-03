// ============================================================================
// service-worker.js — cache do "app shell" para funcionar como app instalado.
// Não intercepta chamadas de API (Supabase) nem CDNs de terceiros — só cuida
// dos arquivos estáticos do próprio site, sempre priorizando a rede quando
// disponível para não travar o usuário numa versão antiga.
// ============================================================================
const CACHE_NOME = "copa-rd-saude-v1";
const ARQUIVOS_APP_SHELL = [
  "./",
  "./index.html",
  "./inscricao.html",
  "./pagamento.html",
  "./chaveamento.html",
  "./admin.html",
  "./admin-login.html",
  "./css/style.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE_NOME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  const mesmaOrigem = url.origin === self.location.origin;
  if (evento.request.method !== "GET" || !mesmaOrigem) return; // deixa a rede cuidar (Supabase, CDNs etc.)

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
