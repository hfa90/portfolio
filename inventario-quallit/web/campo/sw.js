// Service worker do app de conferência: abre sem internet.
// Os dados (Supabase) não passam por aqui — ficam no IndexedDB e sincronizam ao finalizar.
const VERSAO = 'campo-v14';
const ESSENCIAIS = [
  './', './index.html', './campo.css', './campo.js', './manifest.webmanifest',
  '../js/config.js', '../js/versao.js', '../js/offline.js', '../js/fotos.js', '../js/leitor-qr.js', '../js/prazo.js', '../js/resumo.js', '../js/dialogos.js', '../css/prazo.css', '../css/app-android.css', '../js/app-android.js', '../css/notificacoes.css', '../js/notificacoes.js', '../img/logo.svg', '../img/cliente-rd.png',
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
  if (url.pathname.includes('/downloads/')) return; // APK do app Android e a versão dele: sempre rede
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

// ---------- notificações push (função notificar-push no Supabase) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Inventário Quallit', corpo: e.data?.text() || '' }; }
  const icone = new URL('/inventario-quallit/web/icons/icon-192.png', self.location.origin).href;
  e.waitUntil((async () => {
    if (navigator.setAppBadge && typeof d.naoLidas === 'number') navigator.setAppBadge(d.naoLidas).catch(() => {});
    await self.registration.showNotification(d.titulo || 'Inventário Quallit', {
      body: d.corpo || '', icon: icone, badge: icone, tag: d.tag, renotify: !!d.tag,
      requireInteraction: d.prioridade >= 3, data: { url: d.url, id: d.id },
    });
  })());
});
// tocou na notificação: se o app já está aberto, mostra lá; senão abre no endereço do aviso
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { url, id } = e.notification.data || {};
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const daqui = abertas.find((c) => c.url.startsWith(self.registration.scope));
    if (daqui) { await daqui.focus(); daqui.postMessage({ tipo: 'notificacao-aberta', id }); return; }
    await self.clients.openWindow(url || self.registration.scope);
  })());
});
