// Slides Studio service worker: makes the app work offline.
// "__BUILD__" is replaced with the commit id when the site is deployed, so every release gets a fresh cache.
const BUILD = '__BUILD__';
const CACHE = 'slides-studio-' + BUILD;
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest', 'vendor/pptxgen.bundle.js',
  'assets/fonts/fonts.css', 'assets/fonts/newsreader-latin-wght-normal.woff2', 'assets/fonts/newsreader-latin-wght-italic.woff2',
  'assets/fonts/schibsted-grotesk-latin-wght-normal.woff2', 'assets/fonts/ibm-plex-mono-latin-400-normal.woff2', 'assets/fonts/ibm-plex-mono-latin-500-normal.woff2',
  'assets/logo-icon.svg', 'assets/logo-icon-192.png', 'assets/logo-icon-512.png', 'assets/logo-icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('slides-studio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-site files: ask the network first (so updates show up), fall back to the cache when offline.
// Anything on another site (Google sign-in, Drive, fonts) is left alone and never cached.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
