// ─── Central Kitchen Service Worker ──────────────────────────────────────────
// Strategies:
//   • Shell assets (/css/, /js/, /icons/, fonts) → Cache-first, update in background
//   • Navigation (HTML pages)                    → Network-first, offline.html fallback
//   • API calls (/api/)                          → Network-only (never cache)
//   • Push notifications                         → handled below

var CACHE_NAME    = 'ck-shell-v1';
var OFFLINE_URL   = '/offline.html';

// Assets to pre-cache on install (app shell)
var PRECACHE_URLS = [
  '/css/app.css',
  '/js/shell.js',
  '/auth-guard.js',
  '/icons/app-icon.png',
  '/manifest.json',
  OFFLINE_URL,
];

// ─── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ─── Activate: delete old caches ─────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return clients.claim();
    })
  );
});

// ─── Fetch: routing strategies ───────────────────────────────────────────────
self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  // Skip non-GET and cross-origin
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // API: always network-only
  if (url.pathname.startsWith('/api/')) return;

  // Shell assets: cache-first, refresh in background
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/')  ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/auth-guard.js'
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Navigation (HTML pages): network-first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(req));
    return;
  }
});

// ─── Cache-first strategy ─────────────────────────────────────────────────────
function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) {
      // Refresh in background
      fetch(req).then(function (fresh) {
        if (fresh && fresh.ok) {
          caches.open(CACHE_NAME).then(function (c) { c.put(req, fresh); });
        }
      }).catch(function () {});
      return cached;
    }
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, clone); });
      }
      return res;
    });
  });
}

// ─── Network-first + offline fallback for navigations ────────────────────────
function networkFirstWithOfflineFallback(req) {
  return fetch(req).catch(function () {
    return caches.match(req).then(function (cached) {
      return cached || caches.match(OFFLINE_URL);
    });
  });
}

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
    icon:    '/icons/app-icon.png',
    badge:   '/icons/app-icon.png',
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
