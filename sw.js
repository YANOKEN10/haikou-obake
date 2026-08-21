// ============================================================
//  オフラインでも遊べるようにする（ホーム画面に追加したとき用）
//   ・通信できるときは必ず新しいものを取りに行く（更新が届かない事故を防ぐ）
//   ・通信できないときだけ、しまってあるものを出す
// ============================================================
const CACHE = "haikou-obake-v2";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./lib/three.module.js",
  "./src/main.js", "./src/world.js", "./src/sky.js", "./src/player.js", "./src/human.js",
  "./src/entities.js", "./src/ui.js", "./src/home.js", "./src/save.js", "./src/cloud.js",
  "./src/audio.js", "./src/data.js", "./src/util.js", "./src/meshbuild.js", "./src/touch.js",
  "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // フォントなど外部は素通し
  if (url.pathname.startsWith("/api/")) return;    // ログインや記録は絶対にしまわない

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
