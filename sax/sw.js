const CACHE = "saxchord-v1";
const SHELL = ["./index.html", "./styles.css", "./app.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("saxchord-")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// 練習中はオフラインでも動いてほしいので、シェルはネットワーク優先＋キャッシュ退避。
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // このアプリのディレクトリ配下だけを担当する（同じサイトの他のアプリに触らない）
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match("./index.html")))
  );
});
