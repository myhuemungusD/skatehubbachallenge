self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open('skatehubba-shell-v1').then((cache) => cache.addAll(['/']))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== 'skatehubba-shell-v1').map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request).catch(() => caches.match('/'))
    )
  );
});
