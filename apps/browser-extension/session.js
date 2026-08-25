/**
 * Keeps the extension in step with the learner's shared edOS session.
 *
 * The extension used to capture whenever it was installed and signed in, with
 * no notion of a session at all — its events were filed against whatever
 * session the API happened to have open. Now capture only happens while a
 * session is actually running, and that session can be started from any
 * surface: the web app, the desktop agent, the editor, or here.
 *
 * Polling rather than a websocket: the service worker is evicted regularly, so
 * a long-lived socket would be torn down constantly. The extension already has
 * a 30s alarm, so we reuse it.
 */

import { getApiBase } from './config.js';

export const SURFACE = 'browser';

let cached = { session: null, checkedAt: 0 };

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get('accessToken', (data) => resolve(data.accessToken || null));
  });
}

async function request(path, options = {}) {
  const token = await getToken();
  if (!token) return null;

  const apiBase = await getApiBase();
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** The current shared session, or null when nothing is running. */
export async function fetchActiveSession() {
  try {
    const data = await request('/session/active');
    cached = { session: data?.session ?? null, checkedAt: Date.now() };
    return cached.session;
  } catch {
    // On a network failure keep the last known state rather than flapping
    // capture off and on.
    return cached.session;
  }
}

/** Last known session without hitting the network. */
export function getCachedSession() {
  return cached.session;
}

export function setCachedSession(session) {
  cached = { session: session ?? null, checkedAt: Date.now() };
}

/** Is this surface an active participant of the running session? */
export function isCapturing() {
  const session = cached.session;
  if (!session || session.status !== 'active') return false;
  return (session.participants || []).some(
    (p) => p.surface === SURFACE && p.status !== 'left',
  );
}

/**
 * Announce this surface, then report liveness.
 *
 * Called on every alarm tick so the extension self-heals: if the service worker
 * was evicted and restarted, or a session started elsewhere while it was
 * asleep, the next tick reattaches it.
 */
export async function syncSession() {
  return (await pulse()).session;
}

/**
 * One tick against the server.
 *
 * A single request keeps this surface attached, and returns anything the server
 * wants shown: a knowledge check assigned to the browser, or a wrap-up because
 * the session was ended somewhere else. Previously this took three requests and
 * could learn neither of those things.
 */
export async function pulse() {
  const idle = { session: null, check: null, endedSession: null };

  try {
    const body = { surface: SURFACE, deviceName: browserLabel() };

    // Telling the server what we think we are in is what lets it reply "that
    // one ended" rather than simply returning nothing.
    if (cached.session?.id) body.knownSessionId = cached.session.id;

    const data = await request('/session/pulse', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!data) return idle;

    setCachedSession(data.session ?? null);
    return {
      session: data.session ?? null,
      check: data.check ?? null,
      endedSession: data.endedSession ?? null,
    };
  } catch {
    // Keep the last known state rather than flapping capture off and on.
    return { session: cached.session, check: null, endedSession: null };
  }
}

/** Submit an answer to a knowledge check. */
export async function answerCheck(checkId, answer, sessionId) {
  return request('/session/check/answer', {
    method: 'POST',
    body: JSON.stringify({ checkId, answer, sessionId }),
  });
}

/** Dismiss a knowledge check without answering. */
export async function skipCheck(checkId, sessionId) {
  try {
    await request('/session/check/skip', {
      method: 'POST',
      body: JSON.stringify({ checkId, sessionId }),
    });
  } catch {
    // Skipping is best effort.
  }
}

/** A readable name for this browser, so the devices list is meaningful. */
function browserLabel() {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : 'Browser';
  const os = /Mac OS X/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Linux/.test(ua)
        ? 'Linux'
        : '';
  return os ? `${name} on ${os}` : name;
}

/** Start a session from the browser. */
export async function startSession(topic) {
  const result = await request('/session/start', {
    method: 'POST',
    body: JSON.stringify({
      topic: topic || 'Browsing session',
      surface: SURFACE,
      deviceName: browserLabel(),
    }),
  });
  if (result?.session) setCachedSession(result.session);
  return result?.session ?? null;
}

/** End the session for every surface. */
export async function endSession() {
  const result = await request('/session/end', { method: 'POST', body: '{}' });
  setCachedSession(null);
  return result ?? null;
}
