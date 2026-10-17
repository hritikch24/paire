/* Push only: deliberately no fetch handler or offline cache for member data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function binding(value, write = false) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('paire-push', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('state', write ? 'readwrite' : 'readonly');
      const op = write ? tx.objectStore('state').put(value, 'uid') : tx.objectStore('state').get('uid');
      tx.oncomplete = () => { resolve(write ? value : op.result); db.close(); };
      tx.onerror = () => { reject(tx.error); db.close(); };
    };
  });
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'paire-push-bind' || !event.source?.url) return;
  const url = new URL(event.source.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return;
  const uid = typeof event.data.uid === 'string' ? event.data.uid : null;
  event.waitUntil(binding(uid, true).then(async () => {
    if (!uid) for (const notification of await self.registration.getNotifications()) notification.close();
    event.ports[0]?.postMessage({ saved: true });
  }));
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data.json(); } catch { return; }
    if (!data?.uid || await binding() !== data.uid) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // A focused Paire tab already has live messages and match alerts.
    if (windows.some(client => client.focused && new URL(client.url).pathname.startsWith('/app/') && new URL(client.url).searchParams.get('support') !== '1')) return;
    const url = new URL('/app/', self.location.origin);
    if (/^[A-Za-z0-9_-]{1,256}$/.test(data.matchId || '')) url.searchParams.set('chat', data.matchId);
    else if (data.type === 'duo') url.searchParams.set('duo', '1');
    url.searchParams.set('for', data.uid);
    await self.registration.showNotification(typeof data.title === 'string' ? data.title : 'Paire', {
      body: typeof data.body === 'string' ? data.body : 'You have a new connection.',
      icon: '/icon-192.png', badge: '/icon-192.png', tag: data.tag || 'paire',
      data: { url: url.href, uid: data.uid }
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data;
    if (!data?.uid || await binding() !== data.uid) return;
    const url = new URL(data.url, self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== '/app/') return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).pathname.startsWith('/app/') && new URL(client.url).searchParams.get('support') !== '1');
    if (existing) { existing.postMessage({ type: 'paire-push-open', url: url.href }); await existing.focus(); }
    else await self.clients.openWindow(url.href);
  })());
});
