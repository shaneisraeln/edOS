/**
 * edOS Browser Extension - Background Service Worker
 *
 * Tracks all educational tabs, stores context, and triggers quizzes
 * when the user leaves a tab they spent meaningful time on.
 */

import { getApiBase } from './config.js';
import {
  SURFACE,
  isCapturing,
  pulse,
  syncSession,
  getCachedSession,
  fetchActiveSession,
  startSession,
  endSession,
} from './session.js';

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

/**
 * Capture requires two things: the user has not paused the extension locally,
 * and a shared session is actually running with this surface participating.
 *
 * The second condition is the point of the unified session — the extension no
 * longer records whenever it happens to be installed.
 */
function shouldCapture() {
  return trackingEnabled && isCapturing();
}

/** Reflect session state on the toolbar icon so the state is never a mystery. */
function updateBadge() {
  const session = getCachedSession();
  if (!session) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const capturing = shouldCapture();
  chrome.action.setBadgeText({ text: capturing ? 'on' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: capturing ? '#16a34a' : '#71717a' });
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
  if (!shouldCapture()) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    handleTab(activeInfo.tabId, tab);
  } catch (e) {
    log('onActivated error', e.message);
  }
});

// When a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!shouldCapture()) return;
  if (changeInfo.status === 'complete' && tab.url) {
    handleTab(tabId, tab);
  }
});

// When a tab is closed - THIS IS WHERE QUIZ TRIGGERS
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!shouldCapture()) return;
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
    const apiBase = await getApiBase();
    const res = await fetch(`${apiBase}/context-quiz/generate`, {
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
    const apiBase = await getApiBase();
    const res = await fetch(`${apiBase}/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveState();
  } catch (e) {
    // Put the batch back so nothing is lost when the API is unreachable.
    eventQueue.unshift(...events);
    log('Event sync failed, events requeued', e.message);
  }
}

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get('accessToken', (data) => resolve(data.accessToken || null));
  });
}

// --- Periodic sync ---
//
// One alarm drives everything. The pulse runs first so capture state is current
// before events are flushed, and so the extension reattaches itself after the
// service worker has been evicted and restarted.
//
// 0.5 is the smallest period Chrome honours reliably for alarms, which is why
// the knowledge check interval is server-owned: the server decides when a check
// is due, and whichever surface pulses next picks it up.
chrome.alarms.create('syncEvents', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'syncEvents') return;
  await tick();
});

/** One round of server contact, plus anything the server asked us to show. */
async function tick() {
  const { check, endedSession } = await pulse();
  updateBadge();

  if (check) await openCheckPopup(check);
  if (endedSession) await showWrapUp(endedSession);

  // Nothing captured outside a session, so nothing to flush either.
  if (isCapturing()) await syncEvents();
}

/**
 * Present a knowledge check assigned to this surface.
 *
 * Reuses the existing quiz popup window, which reads whatever is in
 * `pendingQuiz`. The `kind` field tells it to submit to the session check
 * endpoints rather than the context-quiz ones.
 */
async function openCheckPopup(check) {
  const payload = {
    kind: 'session-check',
    id: check.id,
    sessionId: check.sessionId,
    topic: check.topic,
    intervalSeconds: check.nextInSeconds,
    questions: [{ id: check.id, text: check.question }],
  };

  await chrome.storage.local.set({ pendingQuiz: payload });
  chrome.windows.create({
    url: chrome.runtime.getURL('quiz-popup.html'),
    type: 'popup',
    width: 460,
    height: 520,
    focused: true,
  });
  log('Knowledge check popup opened', { checkId: check.id });
}

/**
 * Say that the session finished elsewhere.
 *
 * The extension previously just went quiet, which is indistinguishable from it
 * having broken. Guarded by a stored id so a repeated pulse cannot reopen it.
 */
async function showWrapUp(ended) {
  const { lastWrapUpSessionId } = await chrome.storage.local.get('lastWrapUpSessionId');
  if (lastWrapUpSessionId === ended.id) return;

  await chrome.storage.local.set({ lastWrapUpSessionId: ended.id, pendingWrapUp: ended });
  chrome.windows.create({
    url: chrome.runtime.getURL('quiz-popup.html'),
    type: 'popup',
    width: 420,
    height: 420,
    focused: true,
  });
  log('Session ended elsewhere', { sessionId: ended.id, reason: ended.reason });
}

// Check immediately on startup rather than waiting up to 30s for the first alarm.
tick().catch(() => {});

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
    // Clear session data but keep the configured API endpoint, otherwise the
    // user has to re-enter it after every sign out.
    chrome.storage.local.remove([
      'accessToken',
      'refreshToken',
      'user',
      'pendingQuiz',
      'trackedTabs',
      'eventQueue',
    ]);
    trackedTabs = {};
    eventQueue = [];
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
    // Refresh session state before answering so the popup never shows stale
    // capture status.
    (async () => {
      await syncSession();
      updateBadge();

      const { user } = await chrome.storage.local.get('user');
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
        loggedIn: !!user,
        user,
        queueSize: eventQueue.length,
        trackingEnabled,
        capturing: shouldCapture(),
        session: getCachedSession(),
        surface: SURFACE,
        trackedTabs: tabs,
      });
    })();
    return true;
  }

  if (msg.type === 'START_SESSION') {
    (async () => {
      try {
        const session = await startSession(msg.topic);
        updateBadge();
        sendResponse({ ok: true, session });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'END_SESSION') {
    (async () => {
      try {
        await endSession();
        trackedTabs = {};
        saveState();
        updateBadge();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // Content script sending context on page hide
  if (msg.type === 'CONTEXT_CAPTURED') {
    if (shouldCapture()) {
      triggerQuiz(msg.data);
    }
    sendResponse({ ok: true });
  }
});
