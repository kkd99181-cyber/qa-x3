// 서비스 워커: 빌드 버전별 전체 사전 캐시 + 캐시 우선. 새 버전은 사용자가 [업데이트]를 눌러야 적용된다.
// 캐시 이름은 이 앱의 경로(scope)를 앞에 붙여, 같은 origin(github.io)의 다른 앱 캐시와 섞이거나 지우지 않는다.
//  - `${PREFIX}app-<버전>`: 앱 셸·데이터·바우처(서비스 워커 책임, 새 버전마다 교체)
//  - `${PREFIX}audio`: 오디오 암호문(화면 쪽 "전체 내려받기"·재생이 채움, 버전이 바뀌어도 유지)
const VERSION = 'a589ddce8ed1';
const PRECACHE = ["./","./d/ab14c888975ac514.bin","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./index.html","./m.json","./manifest.webmanifest","./robots.txt","./src/audio.js","./src/core/cryptobox.js","./src/core/maps.js","./src/core/money.js","./src/core/now.js","./src/core/tz.js","./src/data.js","./src/keystore.js","./src/main.js","./src/state.js","./src/sw-client.js","./src/ui.js","./src/views/bookings.js","./src/views/check.js","./src/views/days.js","./src/views/money.js","./src/views/now.js","./src/views/settings.js","./styleguide.html","./styles/base.css","./styles/components.css","./styles/tokens.css","./v/f1d67f1e57359051.bin","./v/f2b47fe1fad0bb6f.bin"];
const PREFIX = `tripcheck:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}app-${VERSION}`;
const AUDIO = `${PREFIX}audio`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 같은 앱 경로의 옛 app 캐시만 지운다(이름만으로 소유를 알 수 없는 다른 캐시는 건드리지 않음)
    for (const key of await caches.keys()) if (key.startsWith(`${PREFIX}app-`) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'VERSION') event.source?.postMessage({ version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const hit = (await (await caches.open(CACHE)).match(req, { ignoreSearch: true }))
      ?? (await (await caches.open(AUDIO)).match(req, { ignoreSearch: true }));
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await (await caches.open(CACHE)).match('./index.html');
      if (shell) return shell;
    }
    return fetch(req); // 캐시에 없는 것만 네트워크(오프라인이면 실패)
  })());
});
