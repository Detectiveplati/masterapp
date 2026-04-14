/**
 * shell.js — Universal Navigation Shell
 *
 * Injects the top navbar and side navigation into every page.
 * Include at the END of <body>:  <script src="/js/shell.js"></script>
 *
 * Each page must declare its module via:  <body data-module="maintenance|foodsafety|foodsafetyforms|label-print|templog|order-manager|procurement|admin|hub">
 *
 * Coordinates with auth-guard.js — reads window._authUser to avoid
 * a second round-trip to /api/auth/me.
 */
(function () {
  'use strict';

  function iconSvg(name) {
    var icons = {
      menu:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
      home:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
      bell:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
      maintenance:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-3 2-2-2 2-3z"/></svg>',
      forms:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h7l5 5v13H9z"/><path d="M16 3v5h5"/><path d="M5 7H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1"/><path d="M12 13h5"/><path d="M12 17h5"/><path d="M12 9h1"/></svg>',
      shield:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
      printer:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h10v5"/><path d="M7 17H6a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1"/><path d="M7 14h10v7H7z"/><path d="M17 11h.01"/></svg>',
      thermometer:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0z"/><path d="M12 9v7"/></svg>',
      clipboard:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/></svg>',
      procurement:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h9.8a1 1 0 0 0 1-.8L21 7H7.2"/></svg>',
      pest:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M8 10v4a4 4 0 0 0 8 0v-4"/><path d="M4 10l4 2"/><path d="M20 10l-4 2"/><path d="M6 6l3 2"/><path d="M18 6l-3 2"/><path d="M6 18l3-2"/><path d="M18 18l-3-2"/></svg>',
      archive:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z"/><path d="M10 12h4"/></svg>',
      settings:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.27.3.48.65.6 1a1.7 1.7 0 0 0 1 .4H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1 .4 1.7 1.7 0 0 0-.5.6z"/></svg>',
      user:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
      dashboard:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13a9 9 0 1 1 18 0"/><path d="M12 13l4-4"/><path d="M7 16h.01"/><path d="M17 16h.01"/></svg>'
    };
    return icons[name] || icons.dashboard;
  }

  function iconSpan(name, extraClass) {
    return '<span class="' + (extraClass || 'nav-icon') + '" aria-hidden="true">' + iconSvg(name) + '</span>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── PWA: inject manifest, icons, iOS meta tags, and register SW ──────────
  (function injectPWA() {
    var head = document.head;
    var iconUrl = '/icons/app-icon.png';

    // Web App Manifest
    if (!document.querySelector('link[rel="manifest"]')) {
      var manifest = document.createElement('link');
      manifest.rel = 'manifest'; manifest.href = '/manifest.json';
      head.insertBefore(manifest, head.firstChild);
    }

    // Apple touch icon
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      var ati = document.createElement('link');
      ati.rel = 'apple-touch-icon'; ati.href = iconUrl;
      head.appendChild(ati);
    }

    // Favicon
    if (!document.querySelector('link[rel="icon"]')) {
      var fav = document.createElement('link');
      fav.rel = 'icon'; fav.type = 'image/png'; fav.href = iconUrl;
      head.appendChild(fav);
    }

    // iOS full-screen meta tags
    function injectMeta(name, content) {
      if (!document.querySelector('meta[name="' + name + '"]')) {
        var m = document.createElement('meta');
        m.name = name; m.content = content;
        head.appendChild(m);
      }
    }
    injectMeta('apple-mobile-web-app-capable',          'yes');
    injectMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    injectMeta('apple-mobile-web-app-title',            'Central Kitchen');
    injectMeta('mobile-web-app-capable',                'yes');

    // Theme color (per module accent)
    if (!document.querySelector('meta[name="theme-color"]')) {
      var mod = document.body ? document.body.getAttribute('data-module') : '';
      var THEME = {
        maintenance: '#ff7a18', foodsafety: '#16a085', foodsafetyforms: '#0f9d82', pest: '#2e7d32',
        templog: '#3aa6ff', 'label-print': '#8b5cf6', 'order-manager': '#ff7a18', procurement: '#27ae60', admin: '#7f5af0',
        hub: '#ff7a18', settings: '#ff7a18'
      };
      var tc = document.createElement('meta');
      tc.name = 'theme-color'; tc.content = THEME[mod] || '#ff7a18';
      head.appendChild(tc);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .catch(function (err) { console.warn('SW registration failed:', err); });
      });
    }
  }());

  /* ── Module metadata ─────────────────────────────────────────── */
  var MODULE_INFO = {
    maintenance: { label: 'Maintenance', icon: 'maintenance' },
    foodsafety: { label: 'Food Safety', icon: 'shield' },
    foodsafetyforms: { label: 'Food Safety Forms', icon: 'forms' },
    'label-print': { label: 'Label Printing', icon: 'printer' },
    pest: { label: 'Pest Control', icon: 'pest' },
    templog: { label: 'Kitchen Logs', icon: 'thermometer' },
    'order-manager': { label: 'Order Manager', icon: 'clipboard' },
    procurement: { label: 'Procurement', icon: 'procurement' },
    settings: { label: 'Notifications', icon: 'bell' },
    admin: { label: 'Admin', icon: 'settings' },
    'push-test': { label: 'Push Test', icon: 'bell' },
    tempmon: { label: 'Temp Monitor', icon: 'thermometer' },
    iso: { label: 'ISO Records', icon: 'archive' }
  };

  /* ── Navigation tree ─────────────────────────────────────────── */
  var NAV = [
    { href: '/', icon: 'home', label: 'Hub', module: 'hub' },
    { href: '/notification-settings', icon: 'bell', label: 'Notifications', module: 'settings' },
    { divider: true },
    {
      icon: 'maintenance', label: 'Maintenance', module: 'maintenance',
      href: '/maintenance/maintenance.html', perm: 'maintenance',
      children: [
        { href: '/maintenance/maintenance.html',    label: 'Dashboard' },
        { href: '/maintenance/equipment-list.html', label: 'Equipment' },
        { href: '/maintenance/areas.html',          label: 'Areas & QR Codes' },
        { href: '/maintenance/all-issues.html',     label: 'All Issues' },
        { href: '/maintenance/log-maintenance.html',label: 'Log Maintenance' },
      ],
    },
    {
      icon: 'forms', label: 'Food Safety Forms', module: 'foodsafetyforms',
      href: '/foodsafety-forms/', perm: 'foodsafetyforms',
      children: [
        { href: '/foodsafety-forms/',          label: 'Overview' },
        { href: '/foodsafety-forms/forms',     label: 'Forms Workspace' },
        { href: '/foodsafety-forms/reports',   label: 'Reports Dashboard' },
      ],
    },
    {
      icon: 'shield', label: 'Food Safety', module: 'foodsafety',
      activeModules: ['foodsafety', 'pest'],
      href: '/foodsafety/', perm: 'foodsafety',
      children: [
        { href: '/foodsafety/',               label: 'Overview' },
        { href: '/foodsafety/nc',             label: 'NC Reports' },
        { href: '/foodsafety/report-nc.html', label: 'Log NC' },
        { href: '/foodsafety/nc-list.html',   label: 'View NCs' },
        { href: '/foodsafety/fhc',            label: 'Cert & Licence Tracker' },
        { href: '/pest/',                     label: 'Pest Dashboard' },
        { href: '/pest/record.html',          label: 'Record Findings' },
        { href: '/pest/report.html',          label: 'Pest Report' },
        { href: '/pest/stations.html',        label: 'RTS Stations' },
      ],
    },
    {
      icon: 'printer', label: 'Label Printing', module: 'label-print',
      href: '/label-print/', perm: 'labelprint',
      children: [
        { href: '/label-print/', label: 'Print Launcher' },
      ],
    },
    {
      icon: 'thermometer', label: 'Kitchen Logs', module: 'templog',
      href: '/templog/', perm: 'templog',
      children: [
        { href: '/templog/',                               label: 'Overview' },
        { href: '/templog/departments/combioven.html',     label: 'Combi Oven' },
      ],
    },
    {
      icon: 'clipboard', label: 'Order Manager', module: 'order-manager',
      href: '/order-manager/', perm: 'templog',
      children: [
        { href: '/order-manager/',                         label: 'Overview' },
        { href: '/order-manager/extractor.html',           label: 'Manual Extract' },
        { href: '/order-manager/order-summary.html',       label: 'Order Summary' },
        { href: '/order-manager/chef-preorder.html',       label: 'Chef Pre-Order' },
        { href: '/order-manager/kitchen/kitchentemplog.html', label: 'Kitchen Temp Log' },
      ],
    },
    {
      icon: 'procurement', label: 'Procurement', module: 'procurement',
      href: '/procurement/', perm: 'procurement',
      children: [
        { href: '/procurement/',         label: 'Overview' },
        { href: '/procurement/requests', label: 'All Requests' },
        { href: '/procurement/request',  label: 'New Request' },
      ],
    },
    {
      icon: 'thermometer', label: 'Temp Monitor', module: 'tempmon',
      href: '/tempmon/', perm: 'tempmon',
      children: [
        { href: '/tempmon/',                    label: 'Live Dashboard' },
        { href: '/tempmon/alerts.html',         label: 'Alerts' },
        { href: '/tempmon/report.html',         label: 'Monthly Report' },
        { href: '/tempmon/calibration.html',    label: 'Calibration' },
        { href: '/tempmon/setup.html',          label: 'Setup' },
      ],
    },
    {
      icon: 'archive', label: 'ISO Records', module: 'iso',
      href: '/iso/', perm: 'iso',
      children: [
        { href: '/iso/', label: 'Records Keeper' },
      ],
    },
    { divider: true },
    {
      icon: 'settings', label: 'Admin', module: 'admin',
      href: '/admin/', perm: '__admin__',
      children: [],
    },
    {
      icon: 'bell', label: 'Push Test', module: 'push-test',
      href: '/push-test/', perm: '__admin__',
      children: [],
    },
  ];

  /* ── Current page context ────────────────────────────────────── */
  var body          = document.body;
  var currentModule = (body.dataset.module || '').toLowerCase();
  var currentPath   = window.location.pathname.replace(/\/$/, '') || '/';

  /* ── Build top navbar HTML ───────────────────────────────────── */
  var modInfo  = MODULE_INFO[currentModule];
  var modPill  = modInfo
    ? '<span class="topnav-module">' + iconSpan(modInfo.icon, 'nav-icon') + modInfo.label + '</span>'
    : '';

  var topnavHTML =
    '<nav id="topnav">' +
      '<button id="nav-toggle" aria-label="Toggle navigation" title="Menu">' + iconSvg('menu') + '</button>' +
      '<a href="/" style="line-height:0;text-decoration:none;">' +
        '<img class="topnav-logo" src="/maintenance/assets/Chilli-Api-Logo-170px.png" alt="Central Kitchen">' +
      '</a>' +
      '<span class="topnav-brand">Central Kitchen</span>' +
      modPill +
      '<span class="topnav-spacer"></span>' +
      '<button id="nav-notif" class="notif-btn" title="Notifications" aria-label="Notifications">' + iconSvg('bell') + '<span id="notif-badge"></span></button>' +
      '<span class="topnav-user" id="nav-user">…</span>' +
      '<button id="nav-logout" title="Sign out">Sign Out</button>' +
    '</nav>';

  /* ── Build side nav HTML ─────────────────────────────────────── */
  function isPathActive(href) {
    if (!href || href === '#') return false;
    // Normalise: strip trailing slash, strip .html
    var norm = href.replace(/\/$/, '').replace(/\.html$/, '');
    var curr = currentPath.replace(/\.html$/, '');
    return curr === norm || curr === href.replace(/\/$/, '');
  }

  var sideItems = '<div class="sidenav-section-label">Navigation</div>';

  NAV.forEach(function (item) {
    if (item.divider) {
      sideItems += '<div class="sidenav-divider"></div>';
      return;
    }
    var isModuleActive = item.activeModules
      ? item.activeModules.indexOf(currentModule) !== -1
      : item.module === currentModule;
    var isLinkActive   = isPathActive(item.href);
    var cls = 'sidenav-link' + ((isModuleActive || isLinkActive) ? ' active' : '');
    var permAttr = item.perm ? ' data-perm="' + item.perm + '"' : '';

    sideItems +=
      '<a href="' + item.href + '" class="' + cls + '"' + permAttr + '>' +
        iconSpan(item.icon, 'nav-icon') +
        item.label +
      '</a>';

    // Show sub-links only when this module is active
    if (item.children && item.children.length && isModuleActive) {
      item.children.forEach(function (child) {
        var subActive = isPathActive(child.href);
        var subCls = 'sidenav-sub-link' + (subActive ? ' active' : '');
        sideItems +=
          '<a href="' + child.href + '" class="' + subCls + '">' +
            child.label +
          '</a>';
      });
    }
  });

  sideItems += '<div class="sidenav-footer">Central Kitchen Master App by Zack &copy; 2026</div>';

  var sidenavHTML  = '<aside id="sidenav">'       + sideItems + '</aside>';
  var overlayHTML  = '<div id="sidenav-overlay"></div>';

  /* ── Footer ──────────────────────────────────────────────────── */
  var footerHTML =
    '<footer>' +
      '&copy; ' + new Date().getFullYear() + ' Central Kitchen Master App by Zack. All Rights Reserved.' +
    '</footer>';

  /* ── Inject nav before existing body content ─────────────────── */
  var notifPanelHTML = '<div id="notif-panel"></div>';
  var tmp = document.createElement('div');
  tmp.innerHTML = topnavHTML + sidenavHTML + overlayHTML + notifPanelHTML;
  while (tmp.firstChild) {
    body.insertBefore(tmp.firstChild, body.firstChild);
  }

  /* ── Append footer at end of body ────────────────────────────── */
  var footerEl = document.createElement('div');
  footerEl.innerHTML = footerHTML;
  body.appendChild(footerEl.firstChild);

  /* ── Hamburger toggle (mobile) ───────────────────────────────── */
  var toggle  = document.getElementById('nav-toggle');
  var overlay = document.getElementById('sidenav-overlay');

  if (toggle) {
    toggle.addEventListener('click', function () {
      body.classList.toggle('nav-open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function () {
      body.classList.remove('nav-open');
    });
  }
  // Close sidenav on any nav click (mobile)
  var sidenav = document.getElementById('sidenav');
  if (sidenav) {
    sidenav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        body.classList.remove('nav-open');
      }
    });
  }

  /* ── User info & permissions ─────────────────────────────────── */
  function applyUser(user) {
    var navUser = document.getElementById('nav-user');
    if (navUser) {
      var userIcon = user.role === 'admin' ? 'settings' : 'user';
      navUser.innerHTML =
        iconSpan(userIcon, 'nav-icon') +
        '<span>' + escapeHtml(user.displayName || user.username || 'User') + '</span>' +
        '<span class="topnav-user-role">' + (user.role === 'admin' ? 'Admin' : 'Staff') + '</span>';
    }

    // Logout button
    var logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(function () {})
          .finally(function () { window.location.replace('/login'); });
      });
    }

    // Hide nav links that user doesn't have permission for
    if (user.role !== 'admin') {
      var permLinks = document.querySelectorAll('#sidenav [data-perm]');
      permLinks.forEach(function (link) {
        var perm = link.dataset.perm;
        var allowed = false;
        if (perm === 'foodsafetyforms') {
          allowed = Boolean(user.permissions && (user.permissions.foodsafetyforms || user.permissions.foodsafety));
        } else if (perm) {
          allowed = Boolean(user.permissions && user.permissions[perm]);
        }
        if (perm === '__admin__' || (perm && !allowed)) {
          link.style.display = 'none';
        }
      });
    }
  }

  // Prefer the cached user from auth-guard.js to avoid a second fetch
  if (window._authUser) {
    applyUser(window._authUser);
  } else {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.user) {
          window._authUser = data.user;
          applyUser(data.user);
        }
      })
      .catch(function () {});
  }

  /* ── Notifications ───────────────────────────────────────────── */
  function initNotifications() {
    var btn   = document.getElementById('nav-notif');
    var panel = document.getElementById('notif-panel');
    if (!btn || !panel) return;

    function updateBadge(count) {
      var badge = document.getElementById('notif-badge');
      if (!badge) return;
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? '' : 'none';
    }

    function fetchUnreadCount() {
      fetch('/api/notifications/unread-count', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d) updateBadge(d.count); })
        .catch(function () {});
    }

    function renderItems(items) {
      var html =
        '<div class="notif-header">' +
          '<span class="notification-title">' + iconSpan('bell', 'nav-icon') + '<span>Notifications</span></span>' +
          '<button id="notif-mark-all" class="notif-mark-all">Mark all read</button>' +
        '</div>';
      if (!items.length) {
        html += '<div class="notif-empty">No notifications yet.</div>';
      } else {
        items.forEach(function (n) {
          var cls  = 'notif-item' + (n.read ? ' read' : ' unread');
          var time = new Date(n.createdAt).toLocaleString();
          html +=
            '<div class="' + cls + '" data-id="' + n._id + '">' +
              '<div class="notif-title">' + n.title   + '</div>' +
              '<div class="notif-msg">'   + n.message + '</div>' +
              '<div class="notif-time">'  + time      + '</div>' +
            '</div>';
        });
      }
      panel.innerHTML = html;

      panel.querySelectorAll('.notif-item.unread').forEach(function (item) {
        item.addEventListener('click', function () {
          fetch('/api/notifications/mark-read/' + item.dataset.id, { method: 'POST', credentials: 'include' })
            .then(function () {
              item.classList.remove('unread');
              item.classList.add('read');
              fetchUnreadCount();
            }).catch(function () {});
        });
      });

      var markAll = document.getElementById('notif-mark-all');
      if (markAll) {
        markAll.addEventListener('click', function (e) {
          e.stopPropagation();
          fetch('/api/notifications/mark-all-read', { method: 'POST', credentials: 'include' })
            .then(function () { loadPanel(); fetchUnreadCount(); })
            .catch(function () {});
        });
      }
    }

    function loadPanel() {
      panel.innerHTML = '<div class="notif-empty">Loading…</div>';
      fetch('/api/notifications', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(renderItems)
        .catch(function () { panel.innerHTML = '<div class="notif-empty">Could not load notifications.</div>'; });
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.toggle('open');
      if (open) loadPanel();
    });

    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });

    fetchUnreadCount();
    setInterval(fetchUnreadCount, 60000);
  }

  initNotifications();

}());
