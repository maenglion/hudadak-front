// sw.js (단순화 버전)
self.addEventListener('install', () => {});
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});