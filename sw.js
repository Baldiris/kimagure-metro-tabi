const CACHE = "kimagure-metro-v29";
const CORE = ["./", "./index.html", "./styles.css?v=20260927f", "./premium.css?v=20260929a", "./experience.css?v=20260929c", "./campaign.css?v=20260929b", "./flow-ui.css?v=20260930a", "./data.js?v=20260927f", "./quest-data.js?v=20260927f", "./metro-map.js?v=20260927d", "./metro-network.svg", "./app.js?v=20260930a", "./metro-portal-landscape.webp", "./metro-portal-portrait.webp", "./icon.svg", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, {cache:"no-cache"}).then(response => {
    if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, response.clone())));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html"))));
});
