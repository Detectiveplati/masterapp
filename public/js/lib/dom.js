/**
 * Shared DOM utilities
 * Include on any page:  <script src="/js/lib/dom.js"></script>
 *
 * Provides:
 *   escHtml(str) — escape user strings before inserting into innerHTML
 */

/**
 * Escape a string for safe HTML insertion.
 * Always use this before inserting user-supplied data into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
