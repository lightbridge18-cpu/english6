/* english6 service worker: NETWORK-FIRST for everything same-origin, cache only as an offline fallback.
   Never serves a stale app when the network works. Cross-origin requests (cloud API, fonts) are not touched. */
var CACHE = 'e6-v1';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  var net = req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then(function (res) {
    if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (m) { return m || caches.match(req, { ignoreSearch: true }); }).then(function (m) {
      return m || (req.mode === 'navigate' ? caches.match('./', { ignoreSearch: true }) : undefined) || Response.error();
    });
  }));
});
