/**
 * API base URL for split deploy (client and server on separate origins).
 * Set VITE_API_URL in client/.env — e.g. http://localhost:3001
 */

function normalizeBaseUrl(url) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const base = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (import.meta.env.PROD && !base) {
    throw new Error(
      "VITE_API_URL is required in production. Set it to your API origin (e.g. https://api.example.com)."
    );
  }
  return base;
}

/** @param {string} path - e.g. "/mandate/parse" or "mandate/parse" */
export function apiUrl(path) {
  const base = getApiBaseUrl();
  const suffix = String(path ?? "").startsWith("/") ? path : `/${path}`;
  const apiPath = suffix.startsWith("/api") ? suffix : `/api${suffix}`;
  return base ? `${base}${apiPath}` : apiPath;
}

export function apiFetch(path, init = {}) {
  return fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
  });
}
