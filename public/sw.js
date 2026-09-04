/*
 * UCHI+ Service Worker (最小構成)
 *
 * 目的:
 *   1. PWA として「ホーム画面に追加」できる条件を満たす (fetch ハンドラが必要)
 *   2. アイコンなど静的ファイルの再取得を減らす
 *   3. オフライン時に真っ白な画面ではなく案内を出す
 *
 * 方針:
 *   家族の予定・経費・写真は「常に最新であること」が重要なので、
 *   HTML と API は必ずネットワークを優先する (キャッシュしない)。
 *   古い残高や古い予定を見せてしまう方が害が大きいため。
 */

const CACHE_VERSION = 'uchi-plus-v1';
const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 署名付き URL などは触らない

  // 認証・API は常にネットワーク
  if (url.pathname.startsWith('/api/')) return;

  // 静的アセットはキャッシュ優先
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // ページはネットワーク優先。失敗したらオフライン案内を返す。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html').then((r) => r ?? Response.error())),
    );
  }
});
