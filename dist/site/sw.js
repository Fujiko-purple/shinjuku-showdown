// 自毁 Service Worker：旧站缓存必须清掉，否则老玩家会一直看到旧版
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      await self.registration.unregister();
      var cs = await self.clients.matchAll();
      cs.forEach(function (c) { c.navigate(c.url); });
    } catch (err) {}
  })());
});