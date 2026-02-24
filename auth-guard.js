/**
 * auth-guard.js — Client-side authentication & permission guard.
 *
 * Include this in every protected page. The inline `visibility:hidden` snippet
 * that precedes this script prevents any content flash before auth is verified.
 *
 * Module detection is automatic from the URL pathname:
 *   /maintenance/*  → requires 'maintenance' permission
 *   /foodsafety/*   → requires 'foodsafety' permission
 *   /templog/*      → requires 'templog' permission
 *   /procurement/*  → requires 'procurement' permission
 *   /admin/*        → requires admin role
 */
(function () {
  'use strict';

  var path = window.location.pathname;

  // Map URL prefix → module permission key
  var module = null;
  if      (path.indexOf('/maintenance') === 0) module = 'maintenance';
  else if (path.indexOf('/foodsafety')  === 0) module = 'foodsafety';
  else if (path.indexOf('/templog')     === 0) module = 'templog';
  else if (path.indexOf('/procurement') === 0) module = 'procurement';
  else if (path.indexOf('/admin')       === 0) module = '__admin__';

  function reveal() {
    document.documentElement.style.visibility = '';
  }

  function redirect(url) {
    window.location.replace(url);
  }

  fetch('/api/auth/me', { credentials: 'include' })
    .then(function (r) {
      if (!r.ok) {
        redirect('/login?next=' + encodeURIComponent(path));
        return null;
      }
      return r.json();
    })
    .then(function (data) {
      if (!data) return; // redirect already triggered

      var user = data.user;
      if (!user) { redirect('/login'); return; }

      // Cache user for shell.js (all roles)
      window._authUser = user;

      // Admins have unrestricted access
      if (user.role === 'admin') { reveal(); return; }

      // Admin-only pages redirect non-admins to hub
      if (module === '__admin__') {
        redirect('/');
        return;
      }

      // Module permission check
      if (module && !(user.permissions && user.permissions[module])) {
        redirect('/?access=denied');
        return;
      }

      reveal();
    })
    .catch(function () {
      redirect('/login?next=' + encodeURIComponent(path));
    });
}());
