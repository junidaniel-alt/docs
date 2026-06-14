/* Service worker — shell offline minimo do Agente DAMHA.
   Cacheia apenas a casca do app. NUNCA cacheia respostas da API Anthropic
   nem conteudo do cofre (dado confidencial nao deve persistir aqui). */
const CACHE = "agente-damha-v11";
const SHELL = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nunca intercepta chamadas externas (API Claude, Microsoft Graph, login).
  if (url.origin !== self.location.origin) return;
  // Rede primeiro (sempre pega a versao nova quando online); cache so como fallback offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
