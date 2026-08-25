/**
 * edOS extension popup.
 *
 * Handles sign-in, the tracking switch, live status, and configuring which
 * edOS API the extension talks to.
 */

import { getApiBase, setApiBase, DEFAULT_API_BASE } from './config.js';

const el = {
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
  loginSection: document.getElementById('loginSection'),
  loggedInSection: document.getElementById('loggedInSection'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  loginError: document.getElementById('loginError'),
  apiBase: document.getElementById('apiBase'),
  trackingToggle: document.getElementById('trackingToggle'),
  logoutBtn: document.getElementById('logoutBtn'),
  userName: document.getElementById('userName'),
  queueSize: document.getElementById('queueSize'),
  tabCount: document.getElementById('tabCount'),
  tabList: document.getElementById('tabList'),
  sessionLabel: document.getElementById('sessionLabel'),
  sessionDetail: document.getElementById('sessionDetail'),
  sessionBtn: document.getElementById('sessionBtn'),
  surfaceRow: document.getElementById('surfaceRow'),
  surfaceList: document.getElementById('surfaceList'),
};

/** Current session, so the button knows whether to start or end. */
let activeSession = null;

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();

let started = false;

async function init() {
  if (started) return;
  started = true;

  el.apiBase.value = await getApiBase();

  el.loginBtn.addEventListener('click', login);
  el.logoutBtn.addEventListener('click', logout);
  el.sessionBtn.addEventListener('click', toggleSession);
  el.trackingToggle.addEventListener('click', toggleTracking);
  el.trackingToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTracking();
    }
  });

  // Submit on Enter from either field.
  [el.email, el.password].forEach((field) =>
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') login();
    }),
  );

  // Persist the endpoint when the user leaves the field.
  el.apiBase.addEventListener('change', async () => {
    const stored = await setApiBase(el.apiBase.value || DEFAULT_API_BASE);
    el.apiBase.value = stored;
  });

  refresh();
}

function refresh() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      showSignedOut();
      return;
    }
    if (response.loggedIn) showSignedIn(response);
    else showSignedOut();
  });
}

function showSignedOut() {
  activeSession = null;
  el.loginSection.classList.remove('hidden');
  el.loggedInSection.classList.add('hidden');
  el.status.className = 'pill';
  el.statusText.textContent = 'Signed out';
}

function showSignedIn(data) {
  el.loginSection.classList.add('hidden');
  el.loggedInSection.classList.remove('hidden');

  activeSession = data.session ?? null;
  renderSession(data);

  const trackingOn = Boolean(data.trackingEnabled);
  el.trackingToggle.classList.toggle('on', trackingOn);
  el.trackingToggle.setAttribute('aria-checked', String(trackingOn));

  el.userName.textContent = data.user?.name || data.user?.email || '—';
  el.queueSize.textContent = String(data.queueSize ?? 0);

  const tabs = data.trackedTabs || [];
  el.tabCount.textContent = tabs.length > 0 ? `(${tabs.length})` : '';
  renderTabs(tabs);
}

/**
 * The status pill reflects whether we are actually capturing, which needs both
 * a running session and local tracking enabled. Showing only the local toggle
 * would claim "Tracking" while nothing was being recorded.
 */
function renderSession(data) {
  const session = data.session ?? null;
  const capturing = Boolean(data.capturing);

  el.status.className = `pill ${capturing ? 'on' : session ? 'paused' : ''}`;
  el.statusText.textContent = capturing ? 'Capturing' : session ? 'Idle' : 'No session';

  if (!session) {
    el.sessionLabel.textContent = 'No session';
    el.sessionDetail.textContent = 'Start one here, or from the web app or desktop agent.';
    el.sessionBtn.textContent = 'Start';
    el.surfaceRow.classList.add('hidden');
    return;
  }

  el.sessionLabel.textContent = session.topic || 'Learning session';
  el.sessionBtn.textContent = 'End';

  const blocked = (session.blockedSurfaces || []).some((b) => b.surface === data.surface);
  if (blocked) {
    // Explain the silence instead of appearing broken.
    el.sessionDetail.textContent = 'Browser tracking is off in your edOS settings.';
  } else if (!data.trackingEnabled) {
    el.sessionDetail.textContent = 'Paused in this extension.';
  } else {
    el.sessionDetail.textContent = `Running for ${formatDuration(session.elapsedSeconds || 0)}.`;
  }

  const live = (session.participants || []).filter((p) => p.status !== 'left');
  el.surfaceRow.classList.remove('hidden');
  el.surfaceList.textContent = live.length > 0 ? live.map((p) => p.surface).join(', ') : 'none';
}

async function toggleSession() {
  el.sessionBtn.disabled = true;
  const ending = Boolean(activeSession);
  el.sessionBtn.textContent = ending ? 'Ending' : 'Starting';

  const tab = await currentTabTitle();
  chrome.runtime.sendMessage(
    ending ? { type: 'END_SESSION' } : { type: 'START_SESSION', topic: tab },
    () => {
      el.sessionBtn.disabled = false;
      refresh();
    },
  );
}

/** Seed the session topic from whatever the user is looking at. */
function currentTabTitle() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs?.[0]?.title || 'Browsing session');
      });
    } catch {
      resolve('Browsing session');
    }
  });
}

function renderTabs(tabs) {
  el.tabList.replaceChildren();

  if (!tabs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nothing being tracked';
    el.tabList.append(empty);
    return;
  }

  tabs.forEach((tab) => {
    const row = document.createElement('div');
    row.className = 'tab';

    const dot = document.createElement('span');
    const idle = Date.now() - tab.lastActive >= 30000;
    dot.className = `dot${idle ? ' idle' : ''}`;

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tab.title || tab.url || 'Untitled';
    title.title = tab.title || tab.url || '';

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatDuration(tab.timeSpent ?? 0);

    row.append(dot, title, time);
    el.tabList.append(row);
  });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function toggleTracking() {
  chrome.runtime.sendMessage({ type: 'TOGGLE_TRACKING' }, () => refresh());
}

async function login() {
  const email = el.email.value.trim();
  const password = el.password.value;

  el.loginError.classList.remove('visible');

  if (!email || !password) {
    showLoginError('Enter your email and password.');
    return;
  }

  el.loginBtn.disabled = true;
  el.loginBtn.textContent = 'Signing in';

  try {
    // Honour any endpoint typed in but not yet blurred.
    const apiBase = await setApiBase(el.apiBase.value || DEFAULT_API_BASE);

    const res = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showLoginError(err.message || `Sign in failed (HTTP ${res.status})`);
      return;
    }

    const data = await res.json();
    chrome.runtime.sendMessage(
      {
        type: 'LOGIN',
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      },
      () => {
        el.password.value = '';
        refresh();
      },
    );
  } catch {
    showLoginError('Could not reach the API. Is the server running?');
  } finally {
    el.loginBtn.disabled = false;
    el.loginBtn.textContent = 'Sign in';
  }
}

function showLoginError(message) {
  el.loginError.textContent = message;
  el.loginError.classList.add('visible');
}

function logout() {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => refresh());
}
