// Service Workerのアクティベート
self.addEventListener('activate', event => {
    // ... (existing code)
});

// フェッチイベントの処理
self.addEventListener('fetch', event => {
    // ... (existing code)
});

// プッシュ通知イベントをリッスン
self.addEventListener('push', event => {
  console.log('[Service Worker] Push Received.');
  
  const pushData = event.data.json();

  const title = pushData.title || '新しいエピソードが公開されました';
  const options = {
    body: pushData.body || 'クリックして今すぐ聴く',
    icon: pushData.icon || './icons/icon-192x192.png',
    badge: './icons/icon-96x96.png',
    data: {
      url: pushData.data ? pushData.data.url : self.location.origin,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知クリックイベントをリッスン
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click Received.');

  event.notification.close();

  const urlToOpen = event.notification.data.url || self.location.origin;
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
