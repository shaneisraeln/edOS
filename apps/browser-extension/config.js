/**
 * Shared configuration for the edOS browser extension.
 *
 * The API base URL used to live as a hardcoded constant in three separate
 * files. It now lives here and can be overridden at runtime from the popup,
 * so the same build works against a local API on macOS/Windows or a deployed
 * one without editing source.
 */

export const DEFAULT_API_BASE = 'http://localhost:3001/api';

/** Read the configured API base, falling back to the local default. */
export async function getApiBase() {
  try {
    const { apiBase } = await chrome.storage.local.get('apiBase');
    return normalizeApiBase(apiBase) || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/** Persist a new API base. Returns the normalized value that was stored. */
export async function setApiBase(value) {
  const normalized = normalizeApiBase(value) || DEFAULT_API_BASE;
  await chrome.storage.local.set({ apiBase: normalized });
  return normalized;
}

/**
 * Accept what a user is likely to paste ("localhost:3001", with or without a
 * trailing slash or /api suffix) and return a clean "<origin>/api" string.
 */
export function normalizeApiBase(value) {
  if (!value || typeof value !== 'string') return null;

  let candidate = value.trim().replace(/\/+$/, '');
  if (!candidate) return null;

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, '');
  return path.endsWith('/api') ? `${url.origin}${path}` : `${url.origin}${path}/api`;
}
