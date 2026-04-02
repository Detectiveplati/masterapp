'use strict';

(function () {
  function buildMonthReportUrl(options) {
    const opts = options || {};
    const templateCode = String(opts.templateCode || '').trim();
    const monthKey = String(opts.monthKey || '').trim();
    const unitCode = String(opts.unitCode || '').trim();
    const lang = String(opts.lang || 'en').trim() || 'en';
    const pdf = Boolean(opts.pdf);

    if (!templateCode || !monthKey || !unitCode) return '#';

    const qs = `template=${encodeURIComponent(templateCode)}&month=${encodeURIComponent(monthKey)}&unit=${encodeURIComponent(unitCode)}&lang=${encodeURIComponent(lang)}`;
    return pdf
      ? `/api/foodsafety-checklists/month/report.pdf?${qs}`
      : `/foodsafety-forms/checklists-report.html?${qs}`;
  }

  function formatDateTime(value, emptyFallback) {
    if (!value) return emptyFallback || 'Not saved yet';
    return new Date(value).toLocaleString();
  }

  function isLockedStatus(status) {
    return status === 'finalized' || status === 'verified';
  }

  window.FoodSafetyUiUtils = {
    buildMonthReportUrl,
    formatDateTime,
    isLockedStatus
  };
}());
