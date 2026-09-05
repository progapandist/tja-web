// Offline. The build rewrites the two constants below with the real cache name
// and the real file list — see stamp.js — because only the build knows the
// content hashes, and a precache list that names a file the build did not write
// would make install() reject and leave the reader with no worker at all.
const CACHE = "tja-dev";
const ASSETS = [];

// Everything the app needs is in the list, so the first offline load does not
// depend on what the reader happened to visit while online.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// One cache per build. Dropping every other name on activate is what stops a
// year of deploys piling up in a phone's storage.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy));
  return res;
};

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // The analytics beacon is cross-origin, and a POST is never a cache hit.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // A hashed URL can only ever mean one thing, so the cache is the answer and
  // the network is never worth waiting for.
  if (url.search.startsWith("?v=")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => put(e.request, res))));
    return;
  }

  // Pages and the manifest carry no hash and do change, so they go to the
  // network first and fall back to the last copy seen. A navigation to a page
  // that was never visited falls back to the app itself rather than to the
  // browser's offline error.
  e.respondWith(
    fetch(e.request)
      .then((res) => put(e.request, res))
      .catch(() =>
        caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("/") : undefined)),
      ),
  );
});
