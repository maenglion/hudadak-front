
const CACHE_VER = 'v6.2.4';              // 배포 때마다 숫자/해시 변경함
const APP_CACHE = `app-${CACHE_VER}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();                    // 새 SW 즉시 활성화함
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k)));
    await clients.claim();               // 열린 모든 탭 점유함
  })());
});

// 페이지에서 보내는 강제 교체 명령 처리함
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // HTML/문서는 항상 네트워크 우선 + 실패 시 캐시 폴백함
  const isHTML = req.destination === 'document' || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch (e) {
        const cached = await caches.match(req);
        return cached || new Response('offline', { status: 503 });
      }
    })());
    return;
  }

  // 파일명에 해시가 있으면 Cache First
  const hasHash = /\.[0-9a-f]{8,}\./i.test(url.pathname);
  if (hasHash) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      const cache = await caches.open(APP_CACHE);
      cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // 그 외는 Stale-While-Revalidate
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const cached = await caches.match(req);
    const net = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  })());
});
