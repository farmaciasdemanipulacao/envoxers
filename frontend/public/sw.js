// Envoxers — Service Worker
// Habilita instalação como PWA (Android/desktop via beforeinstallprompt, iOS via
// instrução manual — ver InstallBanner em tc-app.jsx) e Web Push (alerta de farol
// piorando, mensagem de chat direto — ver app/services/push.py no backend).

const CACHE_NAME = "envoxers-v29-static-only";

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"])
        .catch(() => {})
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("envoxers-") && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    )
  ]));
});

// Nunca guardar arquivos de negócio, respostas autenticadas, downloads ou chamadas API.
// Somente assets públicos, estáticos, versionados e pertencentes ao próprio domínio.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const staticAsset = /^\/(assets-runtime\/(?:login|app)\.js|vendor\/[^/]+\.js|icons\/[^/]+\.png)$/.test(url.pathname);
  if (!staticAsset) {
    if (req.mode === "navigate") {
      event.respondWith(fetch(req).catch(() => caches.match("/")));
    }
    return;
  }
  event.respondWith(
    fetch(req).then(response => {
      if (response.ok) {
        const clone=response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req,clone)));
      }
      return response;
    }).catch(() => caches.match(req))
  );
});

// Push: recebe notificação do backend (broadcast_push em app/services/push.py) e exibe
self.addEventListener('push', (event) => {
  let data = { title: 'Envoxers', body: 'Nova notificação', tag: 'envoxers' };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'envoxers',
    data: { tag: data.tag || 'envoxers' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Click na notificação: foca a aba já aberta (ou abre uma nova) e manda o React
// navegar pra tela relevante — farol.py manda tag "envoxers-farol", chat.py
// manda "envoxers-chat" (ver enviar_mensagem em app/api/routes/chat.py).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const tag = (event.notification.data && event.notification.data.tag) || 'envoxers';
  const view = tag === 'envoxers-chat' ? 'chat' : tag === 'envoxers-farol' ? 'farol' : tag === 'envoxers-pdi' ? 'f4' : null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (view) client.postMessage({ type: 'NAVIGATE', view });
          return;
        }
      }
      return self.clients.openWindow('/');
    })
  );
});
