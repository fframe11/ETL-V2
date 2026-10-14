/**
 * Data Serve API Configuration & Base URL Resolver
 * ==================================================
 * Configures the serving API base URL for frontend network requests.
 * 
 * Environment Variables:
 * - VITE_API_URL: Target FastAPI backend URL (e.g. "https://dataserve-api.onrender.com").
 *   When unset or empty, defaults to "" (relative path / same-origin proxy).
 * - VITE_DEMO_MODE: Explicitly force demo snapshot mode ("true" / "false").
 */

let _runtimeApiBaseUrl = null;

/**
 * Programmatically overrides the API Base URL at runtime (useful for testing or dynamic config).
 * Pass null to restore environment variable resolution.
 */
export function setApiBaseUrl(url) {
  _runtimeApiBaseUrl = url !== null && url !== undefined ? String(url).trim().replace(/\/+$/, "") : null;
}

export function getApiBaseUrl() {
  if (_runtimeApiBaseUrl !== null) {
    return _runtimeApiBaseUrl;
  }
  // On Vercel deployments, use relative same-origin routing so requests flow through Vercel's edge proxy to Singapore
  if (typeof window !== "undefined" && window.location.hostname.includes("vercel.app")) {
    return "";
  }
  const envUrl = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
                 (typeof window !== "undefined" && window.__DATA_SERVE_API_URL__);
  if (envUrl && typeof envUrl === "string" && envUrl.trim() && !envUrl.includes("dataserve-api.onrender.com")) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "";
}

/**
 * Resolves a full API URL given a relative or absolute path.
 * Prevents duplicate '/api/v1' segments when base URL already specifies it.
 */
export function resolveApiUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const base = getApiBaseUrl();
  if (!base) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  if (base.endsWith("/api/v1") && path.startsWith("/api/v1")) {
    const sub = path.slice("/api/v1".length);
    return `${base}${sub.startsWith("/") ? sub : `/${sub}`}`;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Determines whether the UI should run in Precomputed Static Demo Mode.
 * - Explicit Demo Mode: Activated via window.__SDOQAP_STATIC_DEMO__,
 *   localStorage "sdoqap_static_demo", or VITE_DEMO_MODE=true.
 * - Live API Mode: If VITE_API_URL is configured and no explicit demo flag is set,
 *   Live mode is active.
 * - Standalone Static Fallback: Only activates on vercel.app if NO live VITE_API_URL is configured.
 */
export function checkInitialDemoMode() {
  if (typeof window === "undefined") return false;
  if (window.__SDOQAP_STATIC_DEMO__ === true) return true;

  if (localStorage.getItem("dataserve_demo_mode") === "true" || localStorage.getItem("sdoqap_demo_mode") === "true") {
    return true;
  }

  const localVal = localStorage.getItem("sdoqap_static_demo");
  if (localVal === "true") return true;
  if (localVal === "false") return false;

  if (typeof import.meta !== "undefined") {
    if (import.meta.env?.VITE_DEMO_MODE === "true") return true;
    if (import.meta.env?.VITE_DEMO_MODE === "false") return false;
  }

  // Live API is the default (works with direct URL or Vercel /api proxy rewrite)
  return false;
}

/**
 * Returns Authorization and X-Session-Token headers from browser storage.
 */
export function getAuthHeaders(extra = {}) {
  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("sdoqap_token") || localStorage.getItem("sdoqap_token"))
    : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}`, "X-Session-Token": token } : {}),
    ...extra,
  };
}

/**
 * Executes a fetch request with an automatic AbortController timeout and credentials/auth headers.
 * Protects against long cold-start hangs (default 3500ms timeout).
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const authHeaders = getAuthHeaders(options.headers || {});
  try {
    const fullUrl = resolveApiUrl(url);
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      credentials: "include",
      ...options,
      headers: authHeaders,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}
