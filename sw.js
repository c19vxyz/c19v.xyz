"use strict";
const CACHE_NAME = "covid19vaccinen-v1";
const DATA_FILE = "vaccindata_v2.json";
const OFFLINE_FALLBACK_HTML = `
<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title>
</head>
<body style="font-family:sans-serif;padding:2rem;text-align:center;color:#333;">
<h2>Du är offline</h2>
<p>Information kunde inte laddas live. Anslut till internet för att se senaste datan.</p>
</body>
</html>`;
const CORE_ASSETS = [
"/",
"index.html"
];
self.addEventListener("install", event => {
self.skipWaiting();
event.waitUntil(
caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
);
});
self.addEventListener("activate", event => {
event.waitUntil(
caches.keys().then(keys => 
Promise.all(
keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
)
).then(() => self.clients.claim())
);
});
self.addEventListener("fetch", event => {
const { request } = event;
if (request.method !== "GET") return;
const url = new URL(request.url);
if (!url.protocol.startsWith("http")) return;
if (url.pathname.includes(DATA_FILE)) {
event.respondWith(
fetch(request)
.then(response => {
if (response.ok) {
const copy = response.clone();
caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
}
return response;
})
.catch(async () => {
const cached = await caches.match(request);
if (cached) return cached;          
return new Response(JSON.stringify({ error: "offline", data: [] }), {
headers: { "Content-Type": "application/json" },
status: 503
});
})
);
return;
}
event.respondWith(
caches.match(request).then(cachedResp => {
const networkFetch = fetch(request)
.then(networkResp => {
if (networkResp.ok) {
caches.open(CACHE_NAME).then(cache => cache.put(request, networkResp.clone()));
}
return networkResp;
})
.catch(() => cachedResp);
return cachedResp || networkFetch.catch(() => {
if (request.headers.get("accept")?.includes("text/html")) {
return new Response(OFFLINE_FALLBACK_HTML, {
headers: { "Content-Type": "text/html; charset=UTF-8" },
status: 503
});
}
return new Response(null, { status: 503 });
});
})
);
});
self.addEventListener("message", event => {
if (event.data?.type === "CLEAR_CACHE") {
event.waitUntil(
caches.delete(CACHE_NAME).then(() => {
event.ports[0]?.postMessage({ cleared: true });
})
);
}});