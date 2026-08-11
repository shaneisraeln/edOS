/**
 * LearningOS Browser Extension - Content Script
 *
 * CORE FEATURE: Captures learning context from web pages.
 * When user spends meaningful time on educational content and navigates away,
 * the captured context is sent to the API which generates a quiz popup.
 */

let startTime = Date.now();
let isActive = true;
let readingTime = 0;
let capturedContent = '';
let pageTitle = document.title;
let scrollDepth = 0;

// --- Context Capture ---

function capturePageContext() {
  // Get main content (prioritize article/main content, skip navigation/ads)
  const selectors = [
    'article', 'main', '[role="main"]',
    '.post-content', '.article-content', '.markdown-body',
    '.documentation', '.doc-content',
    '#content', '#main-content',
  ];

  let content = '';
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.length > 200) {
      content = el.textContent;
      break;
    }
  }

  // Fallback to body text
  if (!content || content.length < 200) {
    content = document.body.innerText;
  }

  // Clean and truncate
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 5000); // Max 5000 chars

  return content;
}

function detectTopicsFromPage() {
  const topics = [];

  // Check meta tags
  const keywords = document.querySelector('meta[name="keywords"]');
  if (keywords) {
    topics.push(...keywords.content.split(',').map(k => k.trim()).filter(Boolean));
  }

  // Check headings
  const headings = document.querySelectorAll('h1, h2');
  headings.forEach(h => {
    if (h.textContent.length < 60) topics.push(h.textContent.trim());
  });

  // Check code blocks (indicates technical content)
  const codeBlocks = document.querySelectorAll('pre code, .highlight');
  if (codeBlocks.length > 0) {
    const languages = new Set();
    codeBlocks.forEach(block => {
      const cls = block.className;
      const langMatch = cls.match(/language-(\w+)/);
      if (langMatch) languages.add(langMatch[1]);
    });
    languages.forEach(lang => topics.push(lang));
  }

  return topics.slice(0, 5);
}

// --- Activity Tracking ---

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    startTime = Date.now();
    isActive = true;
  } else {
    if (isActive) {
      readingTime += Date.now() - startTime;
      isActive = false;
      // When tab becomes hidden, trigger context capture
      triggerContextCapture('tab_hidden');
    }
  }
});

// Track scroll depth
document.addEventListener('scroll', () => {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight > 0) {
    const newDepth = Math.round((window.scrollY / docHeight) * 100);
    scrollDepth = Math.max(scrollDepth, newDepth);
  }
}, { passive: true });

// When user navigates away
window.addEventListener('beforeunload', () => {
  if (isActive) {
    readingTime += Date.now() - startTime;
  }
  triggerContextCapture('page_unload');
});

// --- Core: Send Context for Quiz Generation ---

function triggerContextCapture(trigger) {
  const timeSpentSeconds = Math.round(readingTime / 1000);

  // Only capture if spent more than 60 seconds and scrolled at least 25%
  if (timeSpentSeconds < 60 || scrollDepth < 25) return;

  // Only capture from educational-looking pages
  if (!isLikelyEducational()) return;

  const context = capturePageContext();
  if (context.length < 100) return;

  const topics = detectTopicsFromPage();

  // Send to background script
  chrome.runtime.sendMessage({
    type: 'CONTEXT_CAPTURED',
    data: {
      context,
      source: 'browser',
      url: window.location.href,
      title: pageTitle,
      timeSpent: timeSpentSeconds,
      topics,
      trigger,
      scrollDepth,
    },
  });
}

function isLikelyEducational() {
  const url = window.location.href.toLowerCase();
  const educationalSignals = [
    // AI platforms
    'chat.openai.com', 'claude.ai', 'gemini.google.com',
    // Code/docs
    'github.com', 'stackoverflow.com', 'developer.mozilla.org',
    'docs.python.org', 'docs.microsoft.com', 'docs.oracle.com',
    // Learning platforms
    'medium.com', 'dev.to', 'freecodecamp.org',
    'geeksforgeeks.org', 'w3schools.com',
    'coursera.org', 'udemy.com', 'youtube.com',
    'arxiv.org', 'kaggle.com',
    // Documentation patterns
    '/docs/', '/documentation/', '/api/', '/tutorial/',
    '/guide/', '/learn/', '/reference/',
  ];

  if (educationalSignals.some(s => url.includes(s))) return true;

  // Check for code blocks on page
  const codeBlocks = document.querySelectorAll('pre code, .highlight, .code-block');
  if (codeBlocks.length >= 2) return true;

  // Check for technical headings
  const h1 = document.querySelector('h1');
  if (h1) {
    const techTerms = ['function', 'class', 'algorithm', 'api', 'tutorial', 'guide', 'introduction', 'how to', 'learn'];
    if (techTerms.some(t => h1.textContent.toLowerCase().includes(t))) return true;
  }

  return false;
}


function isLikelyEducational() {
  const url = window.location.href.toLowerCase();
  const educationalSignals = [
    'chat.openai.com', 'claude.ai', 'gemini.google.com',
    'github.com', 'stackoverflow.com', 'developer.mozilla.org',
    'docs.python.org', 'docs.microsoft.com', 'docs.oracle.com',
    'medium.com', 'dev.to', 'freecodecamp.org',
    'geeksforgeeks.org', 'w3schools.com',
    'coursera.org', 'udemy.com', 'youtube.com',
    'arxiv.org', 'kaggle.com',
    '/docs/', '/documentation/', '/api/', '/tutorial/',
    '/guide/', '/learn/', '/reference/',
  ];

  if (educationalSignals.some(s => url.includes(s))) return true;

  const codeBlocks = document.querySelectorAll('pre code, .highlight, .code-block');
  if (codeBlocks.length >= 2) return true;

  const h1 = document.querySelector('h1');
  if (h1) {
    const techTerms = ['function', 'class', 'algorithm', 'api', 'tutorial', 'guide', 'introduction', 'how to', 'learn'];
    if (techTerms.some(t => h1.textContent.toLowerCase().includes(t))) return true;
  }

  return false;
}

// --- Listen for background asking for context ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_CONTEXT') {
    const context = capturePageContext();
    const topics = detectTopicsFromPage();
    sendResponse({ context, topics });
  }
});
