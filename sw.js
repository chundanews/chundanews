const CACHE_NAME = 'ckn-news-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(asset => cache.add(asset).catch(err => console.warn('Failed to cache:', asset, err)))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
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
      url.hostname.includes('open-meteo.com') ||
      url.hostname.includes('imgbb.com')) return;

  if (request.method !== 'GET') return;

  // Same-origin app shell: network first, cached fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(response => {
        // response.ok check karna zyada safe hota hai (status 200-299)
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, copy).catch(err => {
              console.warn('Cache put skipped for:', request.url);
            });
          });
        }
        return response;
      }).catch(() => {
        return caches.match(request).then(cached => {
          return cached || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error());
        });
      })
    );
  }
});
