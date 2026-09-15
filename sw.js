const CACHE = "engolo-shell-v4";
const SHELL = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./demo_words.csv",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  /* 初回の詰め込みもHTTPキャッシュを通さない。ここで古いapp.jsを掴むと、
     オフライン時にいつまでも前の版が出てしまう */
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((path) => new Request(path, { cache: "no-store" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ネットワーク優先で取り直すだけでは足りなかった。ここのfetchは既定で
   ブラウザのHTTPキャッシュを経由するので、配信側が短い有効期限を付けて
   いると、更新したはずのapp.jsが端末では古いまま返り続ける（右上のビルド
   番号が変わらない、の正体）。シェルの取得だけはHTTPキャッシュを通さず、
   毎回サーバーに問い合わせる */
function networkRequest(request) {
  /* cacheを指定したRequestを作るため、GETのみ作り直す。POSTなどは
     本文を読み直せないので、そのまま渡す */
  if (request.method !== "GET") return request;
  return new Request(request.url, {
    method: "GET",
    headers: request.headers,
    credentials: request.credentials,
    redirect: "follow",
    cache: "no-store",
  });
}

// Network-first for the app shell so a new deploy is picked up immediately
// when online; falls back to the cache only when offline. Everything else
// (in particular: AI API calls) always hits the network untouched.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isShellRequest = url.origin === self.location.origin;

  if (!isShellRequest) return; // let API/CDN requests pass straight through

  e.respondWith(
    fetch(networkRequest(e.request))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match("./index.html")))
  );
});
