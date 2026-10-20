// Notification clicks only. No storefront caching, background polling or paid services.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || './#orders', self.location.href);
    if (target.origin !== self.location.origin) return;
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find((client) => {
      const url = new URL(client.url);
      return url.origin === target.origin && url.pathname === target.pathname;
    });
    if (tab) { await tab.focus(); tab.postMessage({ type: 'FUDGIO_OPEN_ORDERS' }); }
    else await self.clients.openWindow(target.href);
  })());
});
