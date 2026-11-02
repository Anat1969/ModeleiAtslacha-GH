// דף ונתונים מהרשת קודם (תמיד הגרסה האחרונה), נכסים מהמטמון. בלי רשת: הגרסה האחרונה שנשמרה.
const CACHE = 'matcher-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || req.url.endsWith('.json') || req.url.endsWith('.js') || req.url.endsWith('.css');
  const put = (res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; };
  if (fresh) {
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(put)));
});
