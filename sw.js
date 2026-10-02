// The offline copy. Two choices carried over from v95, each after a real failure there:
//  - files are cached one by one, so one missing file cannot stop a new version taking over;
//  - pages are network-first, so a page that changed is never stuck on an old copy.
// Scripts and data files are cache-first within one version; a new version gets a new cache.
const VERSION = '0.2.0-step2';
const CACHE = 'planbook-' + VERSION;
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'core/look.css', 'core/boot.js', 'core/merge.js', 'core/store.js', 'core/transport.js', 'core/import-v95.js',
  'contract/contract.json', 'contract/validate.js',
  'import/', 'import/index.html', 'sync/', 'sync/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f =>
    c.add(new Request(f, { cache: 'reload' })).catch(err => console.warn('not cached:', f, err.message))
  ))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('planbook-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || caches.match(new URL('index.html', req.url), { ignoreSearch: true }))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
