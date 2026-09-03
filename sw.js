const CACHE_NAME = 'ckn-news-v1';

// ये फाइलें फोन में हमेशा सेव रहेंगी ताकि साइट तुरंत लोड हो
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// 1. Install Event: पहली बार में फाइलों को डाउनलोड करके कैश में रखना
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('CKN Assets caching started...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: पुराना कैश साफ करना जब आप नया वर्जन लाएं
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event (Network First Strategy): ताज़ा खबर पहले लाओ, न मिले तो कैश से दिखाओ
self.addEventListener('fetch', (event) => {
  // Firebase Firestore/Auth API और एक्सटर्नल रिक्वेस्ट्स को नॉर्मल जाने दें
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebasestorage.googleapis.com') ||
    event.request.url.includes('google-analytics.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // अगर इंटरनेट चल रहा है, तो नया रिस्पॉन्स दिखाएं
        return networkResponse;
      })
      .catch(() => {
        // अगर इंटरनेट नहीं है, तो सेव की गई फाइलों से साइट खोलें
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // होमपेज का बैकअप
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});