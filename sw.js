/* Service Worker — Diagnóstico Chip7
   Estratégia:
   - HTML (navegação): NETWORK-FIRST → sempre pega a versão mais nova quando online,
     e cai para o cache quando offline (funciona na visita sem internet).
   - Demais arquivos (ícones, logo, manifest): CACHE-FIRST (rápido + offline). */
const CACHE = 'chip7-diag-v33';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './jspdf.umd.min.js',
  './jspdf.autotable.min.js',
  './logo-chip7.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // network-first
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    // cache-first
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
