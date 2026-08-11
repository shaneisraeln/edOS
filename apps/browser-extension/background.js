/**
 * edOS Browser Extension - Background Service Worker
 *
 * Tracks all educational tabs, stores context, and triggers quizzes
 * when the user leaves a tab they spent meaningful time on.
 */

const API_BASE = 'http://localhost:3001/api';
const MIN_TIME_FOR_QUIZ = 60; // seconds minimum before triggering quiz

const EDUCATIONAL_DOMAINS = [
  'chat.openai.com', 'claude.ai', 'gemini.google.com',
  'github.com', 'stackoverflow.com', 'medium.com',
  'developer.mozilla.org', 'docs.python.org', 'youtube.com',
  'arxiv.org', 'kaggle.com', 'coursera.org', 'udemy.com',
  'freecodecamp.org', 'w3schools.com', 'geeksforgeeks.org',
  'leetcode.com', 'hackerrank.com', 'dev.to',
  'docs.microsoft.com', 'reactjs.org', 'nextjs.org',
  'tailwindcss.com', 'typescriptlang.org', 'nodejs.org',
  'wikipedia.org', 'mdn.io', 'learn.microsoft.com',
  'rust-lang.org', 'go.dev', 'kotlinlang.org',
  'pytorch.org', 'tensorflow.org', 'scikit-learn.org',
  'huggingface.co', 'openai.com',
];

// Patterns in the URL path that indicate educational content
const EDUCATIONAL_PATH_PATTERNS = [
  '/docs', '/documentation', '/api/', '/tutorial',
  '/guide', '/learn', '/reference', '/blog/',
  '/article', '/post/', '/wiki/',
];

// --- State ---
let trackedTabs = {}; // tabId -> { url, title, startTime, lastActive, domain }
let eventQueue = [];
let trackingEnabled = true;

// Load state
chrome.storage.local.get(['trackingEnabled', 'trackedTabs', 'eventQueue'], (data) => {
  if (data.trackingEnabled !== undefined) trackingEnabled = data.trackingEnabled;
  if (data.trackedTabs) trackedTabs = data.trackedTabs;
  if (data.eventQueue) eventQueue = data.eventQueue;
});

function saveState() {
  chrome.storage.local.set({ trackedTabs, eventQueue });
}

// --- Helpers ---

function isEducationalUrl(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Check domain list
    if (EDUCATIONAL_DOMAINS.some(d => hostname.includes(d))) return true;

    // Check path patterns
    if (EDUCATIONAL_PATH_PATTERNS.some(p => pathname.includes(p))) return true;

    return false;
  } catch {
    return false;
  }
}

function log(msg, data) {
  console.log(`[edOS] ${msg}`, data || '');
}

// --- Tab Events ---

// When user switches to a tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!trackingEnabled) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    handleTab(activeInfo.tabId, tab);
  } catch (e) {
    log('onActivated error', e.message);
  }
});

// When a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!trackingEnabled) return;
  if (changeInfo.status === 'complete' && tab.url) {
    handleTab(tabId, tab);
  }
});

// When a tab is closed - THIS IS WHERE QUIZ TRIGGERS
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!trackingEnabled) return;
  const entry = trackedTabs[tabId];
  if (!entry) return;

  const timeSpent = Math.round((Date.now() - entry.startTime) / 1000);
  log(`Tab closed: "${entry.title}" (${timeSpent}s)`, { tabId, url: entry.url });
  delete trackedTabs[tabId];
  saveState();

  if (timeSpent >= MIN_TIME_FOR_QUIZ) {
    log(`Triggering quiz for: "${entry.title}" (${timeSpent}s spent)`);
    // Use a self-executing async to keep service worker alive
    (async () => {
      try {
        await triggerQuiz({
          context: `The user was reading a page titled "${entry.title}" on ${entry.domain}.\nURL: ${entry.url}\nThey spent ${Math.round(timeSpent / 60)} minutes on this page.`,
          source: 'browser',
          url: entry.url,
          title: entry.title,
          timeSpent: timeSpent,
          topics: [],
        });
      } catch (e) {
        log('Quiz trigger failed in onRemoved', e.message);
      }
    })();
  } else {
    log(`Tab closed too quickly (${timeSpent}s < ${MIN_TIME_FOR_QUIZ}s), skipping quiz`);
  }
});

function handleTab(tabId, tab) {
  if (!tab.url || !isEducationalUrl(tab.url)) {
    // If we were tracking this tab and it navigated to non-educational, treat as "left"
    if (trackedTabs[tabId]) {
      const entry = trackedTabs[tabId];
      const timeSpent = Math.round((Date.now() - entry.startTime) / 1000);
      if (timeSpent >= MIN_TIME_FOR_QUIZ) {
        log(`Tab navigated away from educational content: "${entry.title}" (${timeSpent}s)`);
        requestContextAndQuiz(tabId, entry);
      }
      delete trackedTabs[tabId];
      saveState();
    }
    return;
  }

  const url = new URL(tab.url);

  // Already tracking this exact URL
  if (trackedTabs[tabId] && trackedTabs[tabId].url === tab.url) {
    trackedTabs[tabId].lastActive = Date.now();
    trackedTabs[tabId].title = tab.title || trackedTabs[tabId].title;
    return;
  }

  // New URL in this tab - if old URL was tracked, trigger quiz for old one
  if (trackedTabs[tabId] && trackedTabs[tabId].url !== tab.url) {
    const oldEntry = trackedTabs[tabId];
    const timeSpent = Math.round((Date.now() - oldEntry.startTime) / 1000);
    if (timeSpent >= MIN_TIME_FOR_QUIZ) {
      log(`Tab URL changed, quizzing on old: "${oldEntry.title}" (${timeSpent}s)`);
      requestContextAndQuiz(tabId, oldEntry);
    }
  }

  // Start tracking new URL
  trackedTabs[tabId] = {
    url: tab.url,
    title: tab.title || url.hostname,
    domain: url.hostname,
    startTime: Date.now(),
    lastActive: Date.now(),
  };

  log(`Now tracking: "${tab.title}" (${url.hostname})`, { tabId });
  saveState();

  // Record event
  eventQueue.push({
    eventType: 'PageVisited',
    source: 'browser',
    timestamp: new Date().toISOString(),
    topic: tab.title || url.hostname,
    metadata: { url: tab.url, title: tab.title, domain: url.hostname },
  });
}

// --- Context & Quiz ---

function requestContextAndQuiz(tabId, entry) {
  // Try to get page content from content script
  chrome.tabs.sendMessage(tabId, { type: 'GET_CONTEXT' }, (response) => {
    const context = (response && !chrome.runtime.lastError)
      ? response.context
      : `The user was reading: "${entry.title}" on ${entry.domain}\nURL: ${entry.url}`;

    const topics = (response && response.topics) || [];

    triggerQuiz({
      context,
      source: 'browser',
      url: entry.url,
      title: entry.title,
      timeSpent: Math.round((Date.now() - entry.startTime) / 1000),
      topics,
    });
  });
}

async function triggerQuiz(data) {
  const token = await getToken();
  if (!token) {
    log('ERROR: No access token! User must sign in via extension popup first.');
    // Show a notification badge to indicate sign-in needed
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#c92a2a' });
    return;
  }

  log('Sending context to API for quiz generation...', { title: data.title, timeSpent: data.timeSpent });

  try {
    const res = await fetch(`${API_BASE}/context-quiz/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errText = await res.text();
      log('API error', { status: res.status, body: errText });
      return;
    }

    const quiz = await res.json();
    log('Quiz response', { skipped: quiz.skipped, questionCount: quiz.questions?.length });

    if (!quiz.skipped && quiz.questions && quiz.questions.length > 0) {
      chrome.storage.local.set({ pendingQuiz: quiz }, () => {
        chrome.windows.create({
          url: chrome.runtime.getURL('quiz-popup.html'),
          type: 'popup',
          width: 480,
          height: 600,
          focused: true,
        });
        log('Quiz popup opened');
      });
    }
  } catch (e) {
    log('Quiz generation failed', e.message);
  }
}

// --- Sync ---

async function syncEvents() {
  if (eventQueue.length === 0) return;
  const token = await getToken();
  if (!token) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    await fetch(`${API_BASE}/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ events }),
    });
  } catch (e) {
    eventQueue.unshift(...events);
  }
}

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get('accessToken', (data) => resolve(data.accessToken || null));
  });
}

// --- Periodic Sync ---
chrome.alarms.create('syncEvents', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncEvents') syncEvents();
});

// --- Messages ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LOGIN') {
    chrome.storage.local.set({
      accessToken: msg.accessToken,
      refreshToken: msg.refreshToken,
      user: msg.user,
    });
    chrome.action.setBadgeText({ text: '' }); // Clear error badge
    sendResponse({ ok: true });
  }

  if (msg.type === 'LOGOUT') {
    chrome.storage.local.clear();
    trackedTabs = {};
    trackingEnabled = true;
    sendResponse({ ok: true });
  }

  if (msg.type === 'TOGGLE_TRACKING') {
    trackingEnabled = !trackingEnabled;
    chrome.storage.local.set({ trackingEnabled });
    if (!trackingEnabled) {
      trackedTabs = {};
    }
    log(`Tracking ${trackingEnabled ? 'enabled' : 'disabled'}`);
    sendResponse({ ok: true });
  }

  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(['user'], (data) => {
      const tabs = Object.entries(trackedTabs).map(([tabId, t]) => ({
        tabId: parseInt(tabId),
        url: t.url,
        title: t.title,
        domain: t.domain,
        startTime: t.startTime,
        lastActive: t.lastActive,
        timeSpent: Math.round((Date.now() - t.startTime) / 1000),
      }));

      sendResponse({
        loggedIn: !!data.user,
        user: data.user,
        queueSize: eventQueue.length,
        trackingEnabled,
        trackedTabs: tabs,
      });
    });
    return true;
  }

  // Content script sending context on page hide
  if (msg.type === 'CONTEXT_CAPTURED') {
    if (trackingEnabled) {
      triggerQuiz(msg.data);
    }
    sendResponse({ ok: true });
  }
});
