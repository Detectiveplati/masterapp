/**
 * tz.js — Shared date/time formatting helpers
 * All output is pinned to Asia/Kuala_Lumpur (MYT, UTC+8) with the en-MY locale.
 * Loaded by every tempmon page via <script src="/js/lib/tz.js"></script>
 */
(function () {
  'use strict';

  var TZ     = 'Asia/Kuala_Lumpur';
  var LOCALE = 'en-MY';

  /** Full date + time: "12/03/2026, 9:15:04 AM" */
  window.fmtDateTime = function (ts) {
    if (ts == null || ts === '') return '—';
    return new Date(ts).toLocaleString(LOCALE, { timeZone: TZ });
  };

  /** Date only: "12/03/2026" */
  window.fmtDate = function (ts) {
    if (ts == null || ts === '') return '—';
    return new Date(ts).toLocaleDateString(LOCALE, { timeZone: TZ });
  };

  /** Full time: "9:15:04 AM" */
  window.fmtTime = function (ts) {
    if (ts == null || ts === '') return '—';
    return new Date(ts).toLocaleTimeString(LOCALE, { timeZone: TZ });
  };

  /** Short time HH:MM only: "09:15" */
  window.fmtTimeShort = function (ts) {
    if (ts == null || ts === '') return '—';
    return new Date(ts).toLocaleTimeString(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  };

  /** Chart axis label: "12 Mar, 09:15" */
  window.fmtChartLabel = function (ts) {
    if (ts == null || ts === '') return '';
    return new Date(ts).toLocaleString(LOCALE, { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
})();
