const CACHE_NAME = 'ckn-news-v2';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept Firebase/analytics/API requests.
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('google-analytics.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('open-meteo.com')) return;

  if (request.method !== 'GET') return;

  // Same-origin app shell: network first, cached fallback.
  // Cache navigations and known static assets only; avoid unbounded caching
  // of arbitrary same-origin URLs.
  if (url.origin === self.location.origin) {
    const isStaticAsset = /\.(?:css|js|png|jpe?g|webp|svg|ico|woff2?|ttf|json)$/i.test(url.pathname);
    const shouldCache = request.mode === 'navigate' || isStaticAsset;

    event.respondWith(
      fetch(request).then(response => {
        if (response.ok && shouldCache) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(request).then(cached =>
        cached || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error())
      ))
    );
  }
});
