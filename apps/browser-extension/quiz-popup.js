/**
 * edOS quiz popup.
 *
 * All event handlers are attached with addEventListener. Manifest V3's
 * extension CSP blocks inline <script> blocks and inline on* attributes, so
 * the previous version's `oninput="checkAnswers()"` and trailing inline
 * <script> never ran — which left Submit permanently disabled and the
 * Skip/Done buttons inert.
 */

import { getApiBase } from './config.js';

const DEFAULT_TIME_LIMIT = 180;

let quiz = null;
let timeLeft = DEFAULT_TIME_LIMIT;
let totalTime = DEFAULT_TIME_LIMIT;
let timerInterval = null;
let submitted = false;

const el = {
  loading: document.getElementById('loading'),
  quizSection: document.getElementById('quizSection'),
  resultSection: document.getElementById('resultSection'),
  topicTitle: document.getElementById('topicTitle'),
  questions: document.getElementById('questions'),
  timer: document.getElementById('timer'),
  progressBar: document.getElementById('progressBar'),
  error: document.getElementById('error'),
  skipBtn: document.getElementById('skipBtn'),
  submitBtn: document.getElementById('submitBtn'),
  closeBtn: document.getElementById('closeBtn'),
  scoreDisplay: document.getElementById('scoreDisplay'),
  feedbackDisplay: document.getElementById('feedbackDisplay'),
};

el.skipBtn.addEventListener('click', skipQuiz);
el.submitBtn.addEventListener('click', submitQuiz);
el.closeBtn.addEventListener('click', () => window.close());

document.addEventListener('DOMContentLoaded', loadQuiz);
// DOMContentLoaded may already have fired by the time this module executes.
if (document.readyState !== 'loading') loadQuiz();

let loaded = false;

function loadQuiz() {
  if (loaded) return;
  loaded = true;

  chrome.storage.local.get(['pendingQuiz'], (data) => {
    quiz = data.pendingQuiz;

    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      el.loading.textContent = 'No quiz available.';
      setTimeout(() => window.close(), 1800);
      return;
    }

    el.loading.classList.add('hidden');
    el.quizSection.classList.remove('hidden');
    el.topicTitle.textContent = quiz.topic || quiz.title || 'Learning session';

    renderQuestions(quiz.questions);
    startTimer(quiz.timeLimit || DEFAULT_TIME_LIMIT);
  });
}

function renderQuestions(questions) {
  el.questions.replaceChildren();

  questions.forEach((q, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'question';

    const index = document.createElement('p');
    index.className = 'question-index';
    index.textContent = `${i + 1} of ${questions.length}`;

    // textContent (not innerHTML) — question text comes from the API and is
    // rendered as data, never markup.
    const text = document.createElement('p');
    text.className = 'question-text';
    text.textContent = q.text || '';

    const input = document.createElement('textarea');
    input.id = `answer-${q.id}`;
    input.placeholder = 'Your answer';
    input.setAttribute('aria-label', `Answer to question ${i + 1}`);
    input.addEventListener('input', refreshSubmitState);

    wrapper.append(index, text, input);
    el.questions.append(wrapper);
  });
}

function refreshSubmitState() {
  if (!quiz) return;
  const answered = quiz.questions.some((q) => readAnswer(q.id).length > 0);
  el.submitBtn.disabled = !answered;
}

function readAnswer(questionId) {
  const field = document.getElementById(`answer-${questionId}`);
  return field ? field.value.trim() : '';
}

function startTimer(limit) {
  totalTime = limit;
  timeLeft = limit;
  renderTimer();

  timerInterval = setInterval(() => {
    timeLeft -= 1;
    renderTimer();
    if (timeLeft <= 0) {
      stopTimer();
      // Auto-submit whatever they have when time runs out.
      submitQuiz();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function renderTimer() {
  const safe = Math.max(0, timeLeft);
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  el.timer.textContent = `${minutes}:${seconds} remaining`;

  const pct = totalTime > 0 ? (safe / totalTime) * 100 : 0;
  el.progressBar.style.width = `${pct}%`;
  el.progressBar.classList.toggle('low', pct <= 15);

  const bar = el.progressBar.parentElement;
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function showError(message) {
  el.error.textContent = message;
  el.error.classList.add('visible');
}

function clearError() {
  el.error.textContent = '';
  el.error.classList.remove('visible');
}

async function submitQuiz() {
  if (submitted || !quiz) return;
  submitted = true;

  stopTimer();
  clearError();
  el.submitBtn.disabled = true;
  el.submitBtn.textContent = 'Scoring';

  const answers = quiz.questions.map((q) => ({
    questionId: q.id,
    answer: readAnswer(q.id),
  }));

  try {
    const { accessToken } = await chrome.storage.local.get('accessToken');
    if (!accessToken) throw new Error('Not signed in. Open the edOS popup and sign in.');

    const apiBase = await getApiBase();
    const res = await fetch(`${apiBase}/context-quiz/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ quizId: quiz.id, answers }),
    });

    if (!res.ok) throw new Error(`Scoring failed (HTTP ${res.status})`);

    const result = await res.json();
    showResult(result);
    chrome.storage.local.remove('pendingQuiz');
  } catch (err) {
    // Let them retry rather than losing their answers.
    submitted = false;
    el.submitBtn.disabled = false;
    el.submitBtn.textContent = 'Submit';
    showError(err.message || 'Could not submit. Try again.');
  }
}

function showResult(result) {
  el.quizSection.classList.add('hidden');
  el.resultSection.classList.remove('hidden');
  el.scoreDisplay.textContent = `${Math.round(result.percentage ?? 0)}%`;
  el.feedbackDisplay.textContent = result.feedback || 'Answers recorded.';
}

async function skipQuiz() {
  stopTimer();

  try {
    const { accessToken } = await chrome.storage.local.get('accessToken');
    if (accessToken && quiz?.id) {
      const apiBase = await getApiBase();
      await fetch(`${apiBase}/context-quiz/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quizId: quiz.id }),
      });
    }
  } catch {
    // Skipping is best-effort; never block closing the window.
  }

  chrome.storage.local.remove('pendingQuiz', () => window.close());
}
