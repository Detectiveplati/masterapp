/**
 * Shared HTTP utilities
 * Include on any page:  <script src="/js/lib/http.js"></script>
 *
 * Provides:
 *   apiFetch(url, options) — authenticated fetch wrapper (always sends auth cookie)
 */

/**
 * Authenticated fetch wrapper.
 * Automatically includes the JWT auth cookie and sets Content-Type: application/json.
 * Use this instead of raw fetch() for all API calls within this app.
 *
 * For multipart/form-data uploads, omit options.headers so the browser sets
 * the boundary automatically — pass the FormData as options.body directly.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 *
 * @example
 *   const data = await apiFetch('/api/requests').then(r => r.json());
 *   await apiFetch('/api/requests/' + id, { method: 'DELETE' });
 *   const res  = await apiFetch('/api/requests', { method: 'POST', body: JSON.stringify(payload) });
 */
function apiFetch(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: isFormData ? (options.headers || {}) : {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}
