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
};

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();

let started = false;

async function init() {
  if (started) return;
  started = true;

  el.apiBase.value = await getApiBase();

  el.loginBtn.addEventListener('click', login);
  el.logoutBtn.addEventListener('click', logout);
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
  el.loginSection.classList.remove('hidden');
  el.loggedInSection.classList.add('hidden');
  el.status.className = 'pill';
  el.statusText.textContent = 'Signed out';
}

function showSignedIn(data) {
  el.loginSection.classList.add('hidden');
  el.loggedInSection.classList.remove('hidden');

  const on = Boolean(data.trackingEnabled);
  el.status.className = `pill ${on ? 'on' : 'paused'}`;
  el.statusText.textContent = on ? 'Tracking' : 'Paused';
  el.trackingToggle.classList.toggle('on', on);
  el.trackingToggle.setAttribute('aria-checked', String(on));

  el.userName.textContent = data.user?.name || data.user?.email || '—';
  el.queueSize.textContent = String(data.queueSize ?? 0);

  const tabs = data.trackedTabs || [];
  el.tabCount.textContent = tabs.length > 0 ? `(${tabs.length})` : '';
  renderTabs(tabs);
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
  const m = Math.floor(total / 60);
  const s = total % 60;
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
