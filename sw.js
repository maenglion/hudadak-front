
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

  // 0) HTTP(S) GET만 처리. 그 외(chrome-extension:, data:, blob:, file:, POST 등)는 패스
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttp || req.method !== 'GET') {
    return; // 브라우저 기본 처리
  }

  // 1) HTML은 네트워크 우선(no-store) + 오프라인 폴백
  const isHTML = req.destination === 'document' || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('offline', { status: 503 });
      }
    })());
    return;
  }

  // 2) 파일명에 해시가 있으면 Cache First
  const hasHash = /\.[0-9a-f]{8,}\./i.test(url.pathname);
  if (hasHash) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      try {
        const cache = await caches.open(APP_CACHE);
        await cache.put(req, res.clone());
      } catch (e) {
        // put 실패(opaque 등)는 무시
        console.warn('[SW] cache.put skipped:', e);
      }
      return res;
    })());
    return;
  }

  // 3) 그 외는 Stale-While-Revalidate
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const cached = await caches.match(req);
    try {
      const res = await fetch(req);
      try { await cache.put(req, res.clone()); } catch (e) { /* skip */ }
      return res;
    } catch {
      return cached || fetch(req); // 마지막 시도
    }
  })());
});