// Minimal service worker — required for the browser/PWABuilder to treat this as an installable app.
// It doesn't do offline caching of dynamic data (the app needs the network for Supabase sync anyway),
// it just needs to exist and respond to the install/fetch lifecycle.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass-through: always go to network. No offline cache of app data.
  event.respondWith(fetch(event.request).catch(() => new Response('Χωρίς σύνδεση', { status: 503 })));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Ταξί Στόλος', body: 'Νέα ειδοποίηση' };
  try { payload = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      tag: payload.tag || undefined,
    })
  );
});
