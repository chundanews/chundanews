const CACHE_NAME = 'ckn-news-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use addAll, par agar koi asset fail ho toh service worker crash na ho
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
      url.hostname.includes('open-meteo.com')) return;

  if (request.method !== 'GET') return;

  // Same-origin app shell: network first, cached fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(response => {
        // Sirf valid (ok) responses ko hi cache karein, warna ignore karein
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, copy).catch(err => {
              console.error('Cache put failed for:', request.url, err);
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
