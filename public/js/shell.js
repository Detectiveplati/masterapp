/**
 * shell.js — Universal Navigation Shell
 *
 * Injects the top navbar and side navigation into every page.
 * Include at the END of <body>:  <script src="/js/shell.js"></script>
 *
 * Each page must declare its module via:  <body data-module="maintenance|foodsafety|templog|procurement|admin|hub">
 *
 * Coordinates with auth-guard.js — reads window._authUser to avoid
 * a second round-trip to /api/auth/me.
 */
(function () {
  'use strict';

  /* ── Module metadata ─────────────────────────────────────────── */
  var MODULE_INFO = {
    maintenance: { label: '🔧 Maintenance' },
    foodsafety:  { label: '🥗 Food Safety'  },
    templog:     { label: '🌡️ Kitchen Logs' },
    procurement: { label: '📦 Procurement'  },
    admin:       { label: '⚙️ Admin'        },
  };

  /* ── Navigation tree ─────────────────────────────────────────── */
  var NAV = [
    { href: '/', icon: '🏠', label: 'Hub', module: 'hub' },
    { divider: true },
    {
      icon: '🔧', label: 'Maintenance', module: 'maintenance',
      href: '/maintenance/maintenance.html', perm: 'maintenance',
      children: [
        { href: '/maintenance/maintenance.html',    label: '📊 Dashboard'         },
        { href: '/maintenance/equipment-list.html', label: '⚙️ Equipment'          },
        { href: '/maintenance/areas.html',          label: '📍 Areas & QR Codes'   },
        { href: '/maintenance/all-issues.html',     label: '⚠️ All Issues'          },
        { href: '/maintenance/log-maintenance.html',label: '📝 Log Maintenance'    },
      ],
    },
    {
      icon: '🥗', label: 'Food Safety', module: 'foodsafety',
      href: '/foodsafety/', perm: 'foodsafety',
      children: [
        { href: '/foodsafety/',               label: '🏠 Overview'  },
        { href: '/foodsafety/report-nc.html', label: '➕ Log NC'     },
        { href: '/foodsafety/nc-list.html',   label: '📋 View NCs'  },
      ],
    },
    {
      icon: '🌡️', label: 'Kitchen Logs', module: 'templog',
      href: '/templog/', perm: 'templog',
      children: [
        { href: '/templog/',                               label: '🏠 Overview'   },
        { href: '/templog/departments/combioven.html',     label: '🔥 Combi Oven' },
      ],
    },
    {
      icon: '📦', label: 'Procurement', module: 'procurement',
      href: '/procurement/', perm: 'procurement',
      children: [
        { href: '/procurement/',         label: '🏠 Overview'     },
        { href: '/procurement/requests', label: '📊 All Requests' },
        { href: '/procurement/request',  label: '➕ New Request'  },
      ],
    },
    { divider: true },
    {
      icon: '⚙️', label: 'Admin', module: 'admin',
      href: '/admin/', perm: '__admin__',
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
    ? '<span class="topnav-module">' + modInfo.label + '</span>'
    : '';

  var topnavHTML =
    '<nav id="topnav">' +
      '<button id="nav-toggle" aria-label="Toggle navigation" title="Menu">☰</button>' +
      '<a href="/" style="line-height:0;text-decoration:none;">' +
        '<img class="topnav-logo" src="/maintenance/assets/Chilli-Api-Logo-170px.png" alt="Central Kitchen">' +
      '</a>' +
      '<span class="topnav-brand">Central Kitchen</span>' +
      modPill +
      '<span class="topnav-spacer"></span>' +
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
    var isModuleActive = item.module === currentModule;
    var isLinkActive   = isPathActive(item.href);
    var cls = 'sidenav-link' + ((isModuleActive || isLinkActive) ? ' active' : '');
    var permAttr = item.perm ? ' data-perm="' + item.perm + '"' : '';

    sideItems +=
      '<a href="' + item.href + '" class="' + cls + '"' + permAttr + '>' +
        '<span class="nav-icon">' + item.icon + '</span>' +
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
  var tmp = document.createElement('div');
  tmp.innerHTML = topnavHTML + sidenavHTML + overlayHTML;
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
      var icon = user.role === 'admin' ? '⚙️' : '👤';
      navUser.textContent = icon + ' ' + (user.displayName || user.username || 'User');
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

    // Hide/dim nav links that user doesn't have permission for
    if (user.role !== 'admin') {
      var permLinks = document.querySelectorAll('#sidenav [data-perm]');
      permLinks.forEach(function (link) {
        var perm = link.dataset.perm;
        if (perm === '__admin__') {
          link.style.display = 'none';
          return;
        }
        if (perm && !(user.permissions && user.permissions[perm])) {
          link.style.opacity   = '0.38';
          link.style.pointerEvents = 'none';
          link.style.cursor    = 'not-allowed';
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

}());
