// Service Worker for Web Push Notifications
// Must be served from the root scope: GET /sw.js

self.addEventListener('install', function (event) {
  self.skipWaiting(); // Activate immediately, don't wait for old tabs to close
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim()); // Take control of all open tabs immediately
});

// ─── Push event — fires when server sends a push ──────────────────────────
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Central Kitchen', message: event.data ? event.data.text() : '' };
  }

  var title   = data.title   || 'Central Kitchen';
  var message = data.message || 'You have a new notification.';
  var url     = data.url     || '/';

  var options = {
    body:    message,
    icon:    '/maintenance/assets/Chilli-Api-Logo-170px.png',
    badge:   '/maintenance/assets/Chilli-Api-Logo-170px.png',
    data:    { url: url },
    vibrate: [200, 100, 200],
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification click — open or focus the relevant page ────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      // If app is already open, focus it
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
