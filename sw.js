// Offline-Cache: App-Hülle aus dem Cache, Daten immer zuerst aus dem Netz.
const VERSION = 'briefing-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons.svg', 'Geist-Variable.woff2', 'GeistMono-Variable.woff2',
  'icon.svg', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Daten und Konfiguration: Netz zuerst, bei Ausfall letzter Stand aus dem Cache
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
    return;
  }

  // Schriften und Icons ändern sich nie: direkt aus dem Cache
  if (/\.(woff2|png|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request)));
    return;
  }

  // App-Hülle: Netz zuerst (damit Updates sofort ankommen), nach 3 s oder offline aus dem Cache
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    });
    if (!cached) return net;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
    return Promise.race([net.catch(() => cached), timeout]);
  })());
});
