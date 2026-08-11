const API_BASE = 'http://localhost:3001/api';

document.addEventListener('DOMContentLoaded', () => {
  checkStatus();

  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('trackingToggle').addEventListener('click', toggleTracking);
});

function checkStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      showLoginForm();
      return;
    }
    if (response.loggedIn) {
      showLoggedIn(response);
    } else {
      showLoginForm();
    }
  });
}

function showLoggedIn(data) {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('loggedInSection').style.display = 'block';

  // Status badge
  const statusEl = document.getElementById('status');
  if (data.trackingEnabled) {
    statusEl.textContent = 'Active';
    statusEl.className = 'status active';
  } else {
    statusEl.textContent = 'Paused';
    statusEl.className = 'status paused';
  }

  // Toggle
  const toggle = document.getElementById('trackingToggle');
  if (data.trackingEnabled) {
    toggle.classList.add('on');
  } else {
    toggle.classList.remove('on');
  }

  // Stats
  document.getElementById('userName').textContent = data.user?.name || '—';
  document.getElementById('queueSize').textContent = data.queueSize || '0';

  // Tracked tabs
  const tabs = data.trackedTabs || [];
  document.getElementById('tabCount').textContent = tabs.length;
  renderTabs(tabs);
}

function renderTabs(tabs) {
  const list = document.getElementById('tabList');
  if (!tabs || tabs.length === 0) {
    list.innerHTML = '<div class="empty">No tabs being tracked</div>';
    return;
  }

  list.innerHTML = tabs.map(tab => {
    const elapsed = Math.round((Date.now() - tab.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    const isActive = (Date.now() - tab.lastActive) < 30000;

    return `
      <div class="tab-item">
        <span class="dot ${isActive ? '' : 'idle'}"></span>
        <span class="title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title || tab.url || 'Unknown')}</span>
        <span class="time">${timeStr}</span>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showLoginForm() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('loggedInSection').style.display = 'none';
  document.getElementById('status').textContent = 'Off';
  document.getElementById('status').className = 'status inactive';
}

function toggleTracking() {
  chrome.runtime.sendMessage({ type: 'TOGGLE_TRACKING' }, () => {
    checkStatus();
  });
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      errorEl.textContent = err.message || 'Login failed';
      return;
    }

    const data = await res.json();
    chrome.runtime.sendMessage({
      type: 'LOGIN',
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    }, () => checkStatus());
  } catch (e) {
    errorEl.textContent = 'Connection failed. Is the API running?';
  }
}

function logout() {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => checkStatus());
}
