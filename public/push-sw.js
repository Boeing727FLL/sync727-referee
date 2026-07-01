// Background Cron check to keep Cloud Run backend warm and verify daily FLL meeting notifications
async function pingServerCron() {
  try {
    await fetch('/api/push/cron-check', { method: 'POST' });
    console.log('[Background SW Cron] Successfully pinged server-app cron');
  } catch (err) {
    console.warn('[Background SW Cron] Failed to ping:', err);
  }
}

self.addEventListener('activate', function(event) {
  event.waitUntil(pingServerCron());
});

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      
      // Handle both standard JSON payload and FCM structured payload
      const title = data.title || data.notification?.title || 'Sync 727';
      const body = data.body || data.notification?.body || 'התקבלה הודעה חדשה!';
      const payloadData = data.data || data; // FCM puts extra data in .data, standard web push might be flat

      const options = {
        body: body,
        icon: '/AppLogo.png',
        badge: '/AppLogo.png',
        vibrate: payloadData.vibrate || [500, 250, 500],
        tag: payloadData.tag || 'general-notification',
        renotify: true,
        sound: payloadData.sound || 'https://orangefreesounds.com/wp-content/uploads/2014/10/Boeing-747-attendant-chime.mp3',
        data: {
          url: payloadData.url || '/'
        }
      };

      event.waitUntil(
        Promise.all([
          self.registration.showNotification(title, options),
          pingServerCron(), // Warm up backend and check state on incoming notifications
          // Broadcast to all clients to play sound if they are open
          self.clients.matchAll({ type: 'window' }).then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'PLAY_SOUND',
                sound: payloadData.sound || 'https://orangefreesounds.com/wp-content/uploads/2014/10/Boeing-747-attendant-chime.mp3'
              });
            });
          })
        ])
      );
    } catch (e) {
      console.error('Error parsing push data', e);
      // Fallback notification
      event.waitUntil(
        self.registration.showNotification('Sync 727', {
          body: 'התקבלה הודעה חדשה',
          icon: '/AppLogo.png',
          vibrate: [500, 250, 500]
        })
      );
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
