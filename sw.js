// The offline copy. Two choices carried over from v95, each after a real failure there:
//  - files are cached one by one, so one missing file cannot stop a new version taking over;
//  - pages are network-first, so a page that changed is never stuck on an old copy.
// Scripts and data files are cache-first within one version; a new version gets a new cache.
const VERSION = '0.7.0-step4c';
const CACHE = 'planbook-' + VERSION;
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'core/look.css', 'core/boot.js', 'core/merge.js', 'core/store.js', 'core/transport.js', 'core/import-v95.js',
  'core/names.js', 'core/live.js', 'core/live-firebase.js', 'settings/firebase.js', 'core/family-v95.js', 'core/family.js',
  'contract/contract.json', 'contract/validate.js',
  'core/plan.js', 'import/', 'import/index.html', 'sync/', 'sync/index.html',
  'planner/', 'planner/index.html', 'planner/planner.js', 'planner/planner.css',
  'data/reveal-grade2.json', 'data/benchmark-grade2.json', 'data/calendar-2026-27.json', 'data/planner-defaults.json', 'data/family-email.json'
];
// Firebase's own code, from Google's CDN. Must match core/live-firebase.js (a test checks).
const FIREBASE = '10.12.2';
const REMOTE = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']
  .map(f => `https://www.gstatic.com/firebasejs/${FIREBASE}/${f}`);
const isFirebaseCode = url => url.startsWith(`https://www.gstatic.com/firebasejs/`);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...FILES.map(f => c.add(new Request(f, { cache: 'reload' })).catch(err => console.warn('not cached:', f, err.message))),
    ...REMOTE.map(u => c.add(new Request(u, { mode: 'cors' })).catch(err => console.warn('not cached:', u, err.message)))
  ])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('planbook-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (isFirebaseCode(req.url)) {   // versioned files that never change: keep them for offline use
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (new URL(req.url).origin !== location.origin) return;   // Firebase's own traffic is left alone
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
