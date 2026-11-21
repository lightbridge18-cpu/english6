/* english6 service worker v3.5
   - app files: NETWORK-FIRST, cache only as an offline fallback (never serves a stale app when the network works)
   - /audio/*.mp3: CACHE-FIRST, cached on demand the first time a clip is played (nothing is precached); answers Range requests (Safari)
   - /scenes/<id>/*.webp and /scenes/<id>/a/*.mp3 (v3.4 情景小剧场): CACHE-FIRST on demand, in their own cache
   Cross-origin requests (cloud API, fonts) are not touched. */
var CACHE = 'e6-v8', AUDIO = 'e6-audio-v1', SCENES = 'e6-scenes-v1';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== AUDIO && k !== SCENES; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function ranged(req, res) {
  var range = req.headers.get('range'); if (!range || !res || res.status !== 200) return res;
  return res.arrayBuffer().then(function (buf) {
    var m = /bytes=(\d*)-(\d*)/.exec(range) || [], len = buf.byteLength, s = m[1] ? +m[1] : 0, e = m[2] ? Math.min(+m[2], len - 1) : len - 1;
    if (!m[1] && m[2]) { s = Math.max(0, len - +m[2]); e = len - 1; }
    return new Response(buf.slice(s, e + 1), { status: 206, statusText: 'Partial Content', headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes ' + s + '-' + e + '/' + len, 'Content-Length': String(e - s + 1), 'Accept-Ranges': 'bytes' } });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  var isScene = /\/scenes\/[a-z0-9-]+\/(\d+\.webp|a\/\d+\.mp3)$/.test(url.pathname);
  if (isScene || /\/audio\/(us|gb)\/[0-9a-f]{8}\.mp3$/.test(url.pathname)) {
    var key = url.origin + url.pathname;
    e.respondWith(caches.open(isScene ? SCENES : AUDIO).then(function (c) {
      return c.match(key).then(function (hit) {
        if (hit) return ranged(req, hit);
        return fetch(key).then(function (res) { if (res && res.ok && res.status === 200) { c.put(key, res.clone()); } return ranged(req, res); });
      });
    }).catch(function () { return fetch(req); }));
    return;
  }
  var net = req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then(function (res) {
    if (res && res.ok && res.type === 'basic' && res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (m) { return m || caches.match(req, { ignoreSearch: true }); }).then(function (m) {
      return m || (req.mode === 'navigate' ? caches.match('./', { ignoreSearch: true }) : undefined) || Response.error();
    });
  }));
});
