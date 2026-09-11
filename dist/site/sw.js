/* 新宿决战 Service Worker —— 构建版本 20260911205010
   策略：
     导航请求   network-first（永远优先拿最新 HTML），离线回退缓存
     静态资源   cache-first + 后台写入缓存（three.js / game.js 体积大，别反复下载）
     音频       runtime cache：首次交互后才会请求 2.7MB，之后再听就是本地读
   ⚠ 只有 http(s) 能注册 SW；file:// 直接打开时浏览器会忽略本文件。 */
var CACHE = 'shinjuku-20260911205010';
var SHELL = [
  "./",
  "index.html",
  "assets/styles.css",
  "assets/mobile.css",
  "assets/game.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
    .catch(function () {})
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); });
      return r;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
    }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (r) {
      if (r && r.ok && r.type === 'basic') {
        var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); });
      }
      return r;
    });
  }));
});
