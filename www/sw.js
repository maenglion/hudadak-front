// sw.js (서비스 워커 파일)

// 서비스 워커가 설치될 때 실행됩니다.
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  // 캐싱할 파일이 있다면 여기에 추가할 수 있습니다.
});

// 네트워크 요청을 가로챌 때 실행됩니다.
// 이 fetch 이벤트 핸들러가 있어야 PWA 설치가 가능합니다.
self.addEventListener('fetch', (event) => {
  // 현재는 네트워크 요청에 아무것도 하지 않고 그대로 전달합니다.
  event.respondWith(fetch(event.request));
});
