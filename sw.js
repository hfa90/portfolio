// MedAlert Service Worker v2.0
const CACHE = 'medalert-v2';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res && res.status === 200 && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    })).catch(() => caches.match('/index.html'))
  );
});

// ── BACKGROUND SYNC & PERIODIC ALARM CHECK ──────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_ALARMS') {
    checkAndNotify(e.data.alarms);
  }
  if (e.data && e.data.type === 'SCHEDULE_BACKUP') {
    scheduleBackupNotification(e.data.time);
  }
});

function checkAndNotify(alarms) {
  if (!alarms || !alarms.length) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  alarms.forEach(alarm => {
    if (alarm.horario === hhmm && !alarm.tomado) {
      self.registration.showNotification(`💊 Hora do remédio! ${alarm.horario}`, {
        body: `${alarm.paciente}: ${alarm.nome} – ${alarm.dose}`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [500, 200, 500, 200, 500],
        requireInteraction: true,
        tag: alarm.key,
        actions: [
          { action: 'tomei', title: '✅ Tomei' },
          { action: 'snooze', title: '⏰ 10 min' }
        ],
        data: alarm
      });
    }
  });
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'tomei' || e.action === 'snooze') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        const action = e.action;
        const data = e.notification.data;
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({ type: 'ALARM_ACTION', action, data });
        } else {
          self.clients.openWindow('/');
        }
      })
    );
  } else {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) clients[0].focus();
        else self.clients.openWindow('/');
      })
    );
  }
});

// Periodic background check (where supported)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-alarms') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'REQUEST_ALARM_DATA' }));
      })
    );
  }
});

function scheduleBackupNotification(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const ms = target - now;
  setTimeout(() => {
    self.registration.showNotification('💾 MedAlert – Backup automático', {
      body: 'Hora de salvar seu backup diário!',
      icon: '/icon-192.png',
      tag: 'backup-reminder'
    });
  }, ms);
}
