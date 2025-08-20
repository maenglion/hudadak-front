// /public/sw.js
// 배포 때마다 반드시 버전 변경함
const CACHE_VER = 'v6.2.6';
const APP_CACHE = `app-${CACHE_VER}`;

// 설치: 즉시 대기 해제함
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// 활성화: 구 캐시 정리 + 네비게이션 프리로드 켬
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k)));
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await clients.claim();
  })());
});

// 페이지에서 강제 교체 명령 처리함
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// 인증/민감 API는 절대 가로채지 않음
const AUTH_PATHS = ['/login', '/logout', '/token', '/oauth', '/accounts:signIn'];

// fetch 핸들러
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 0) http(s) + GET만 처리, 그 외는 패스함
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttp || req.method !== 'GET') return;

  // 1) 동일 오리진만 캐시 전략 적용(외부 API는 간섭 최소화)
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return; // 외부 API는 브라우저 기본 동작에 맡김

  // 2) 인증/민감 경로는 패스
  if (AUTH_PATHS.some(p => url.pathname.includes(p))) return;

  // 3) HTML 문서: 네트워크 우선 + 프리로드 활용 + 오프라인 폴백
  const isHTML = req.destination === 'document' || url.pathname.endsWith('.html') || req.mode === 'navigate';
  if (isHTML) {
    event.respondWith((async () => {
      try {
        // navigation preload 있으면 먼저 사용
        const preload = ('navigationPreload' in self.registration)
          ? await event.preloadResponse
          : null;
        if (preload) return preload;

        return await fetch(req, { cache: 'no-store' });
      } catch {
        const cached = await caches.match(req, { ignoreSearch: false });
        return cached || new Response('offline', { status: 503, statusText: 'offline' });
      }
    })());
    return;
  }

  // 4) 해시 포함 정적 파일: Cache First
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
        // opaque 등 put 실패는 무시함
        console.warn('[SW] cache.put skipped:', e);
      }
      return res;
    })());
    return;
  }

  // 5) 그 외: Stale-While-Revalidate (동일 오리진 리소스만)
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const cached = await caches.match(req);
    try {
      const res = await fetch(req);
      try { await cache.put(req, res.clone()); } catch (_) {}
      return res;
    } catch {
      // 오프라인이면 캐시 반환, 재시도 fetch는 의미 없으므로 제거함
      return cached || new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
