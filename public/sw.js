/* Service worker: app shell in cache, API "network-first" con fallback offline per le letture. */
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const ASSETS = [
  '/', '/css/tokens.css', '/css/base.css', '/css/components.css', '/css/views.css', '/icon.svg', '/manifest.webmanifest',
  '/js/theme-init.js', '/js/main.js', '/js/router.js', '/js/api.js', '/js/store.js',
  '/js/ui/dom.js', '/js/ui/toast.js', '/js/fx/engine.js', '/js/fx/interactions.js', '/js/audio/engine.js',
  '/js/views/home.js', '/js/views/recipe.js', '/js/views/shared.js', '/js/views/pages.js', '/js/views/admin.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/api/events') return;

  if (url.pathname.startsWith('/api/')) {
    if (/\/(admin|auth)\//.test(url.pathname)) return; // mai in cache
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit ?? new Response(JSON.stringify({ error: 'Sei offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))),
    );
    return;
  }

  if (req.mode === 'navigate') { // SPA: serve sempre la shell
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  // asset statici: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit ?? net;
    }),
  );
});
