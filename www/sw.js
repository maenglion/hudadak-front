// sw.js — 후다닥 미세먼지 피하기
const CACHE_NAME = 'hudadak-v4';
const API_BASE = 'https://air-api-350359872967.asia-northeast3.run.app';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/gps.js',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// 설치: 정적 자원 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API 요청: Network First → 실패 시 캐시
  if (url.origin === new URL(API_BASE).origin) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 정적 자원: Cache First → 없으면 네트워크
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
