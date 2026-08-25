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

  chrome.storage.local.get(['pendingQuiz', 'pendingWrapUp'], (data) => {
    // A wrap-up takes priority: the session is over, so there is nothing to
    // answer even if a check was left sitting in storage.
    if (data.pendingWrapUp) {
      showWrapUp(data.pendingWrapUp);
      return;
    }

    quiz = data.pendingQuiz;

    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      el.loading.textContent = 'Nothing to answer right now.';
      setTimeout(() => window.close(), 1800);
      return;
    }

    el.loading.classList.add('hidden');
    el.quizSection.classList.remove('hidden');
    el.topicTitle.textContent = quiz.topic || quiz.title || 'Learning session';

    renderQuestions(quiz.questions);

    // A recurring session check is one short question, so the long context-quiz
    // countdown would be misleading. Give it a proportion of the interval.
    const limit = isSessionCheck()
      ? Math.max(30, Math.round((quiz.intervalSeconds || 60) * 0.75))
      : quiz.timeLimit || DEFAULT_TIME_LIMIT;
    startTimer(limit);
  });
}

/** Is this the recurring session check rather than a context quiz? */
function isSessionCheck() {
  return quiz?.kind === 'session-check';
}

/**
 * Report that the session ended somewhere else.
 *
 * If the server bundled quiz questions, they are shown as a real answerable
 * popup (the learner's "prove you learned something" on session end). Without
 * questions it falls back to a summary.
 */
function showWrapUp(ended) {
  stopTimer();
  el.loading.classList.add('hidden');
  el.quizSection.classList.add('hidden');

  // The server may have generated end-of-session questions. Show them as
  // a real answerable popup, not just a static card.
  if (ended.quiz && ended.quiz.questions && ended.quiz.questions.length > 0) {
    quiz = {
      kind: 'session-check',
      id: ended.quiz.id,
      sessionId: ended.id,
      topic: ended.quiz.topic || ended.topic,
      intervalSeconds: 0,
      questions: ended.quiz.questions,
    };

    el.quizSection.classList.remove('hidden');
    el.topicTitle.textContent = `Session ended — ${ended.topic}`;
    renderQuestions(ended.quiz.questions);
    startTimer(120);
    chrome.storage.local.remove('pendingWrapUp');
    return;
  }

  // No questions — show the plain summary.
  el.resultSection.classList.remove('hidden');

  const minutes = Math.floor((ended.elapsedSeconds || 0) / 60);
  const seconds = (ended.elapsedSeconds || 0) % 60;
  el.scoreDisplay.textContent = minutes > 0 ? `${minutes}m` : `${seconds}s`;

  const checks = ended.checkCount || 0;
  el.feedbackDisplay.textContent =
    ended.reason === 'abandoned'
      ? `"${ended.topic}" was closed automatically after a long silence. ${checks} check${checks === 1 ? '' : 's'} along the way.`
      : `"${ended.topic}" was ended from another device. ${checks} check${checks === 1 ? '' : 's'} along the way.`;

  chrome.storage.local.remove('pendingWrapUp');
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
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    // The recurring check and the context quiz are graded by different
    // endpoints with different payloads.
    const res = isSessionCheck()
      ? await fetch(`${apiBase}/session/check/answer`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            checkId: quiz.id,
            answer: answers[0]?.answer ?? '',
            sessionId: quiz.sessionId,
          }),
        })
      : await fetch(`${apiBase}/context-quiz/submit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ quizId: quiz.id, answers }),
        });

    if (!res.ok) throw new Error(`Scoring failed (HTTP ${res.status})`);

    const result = await res.json();
    if (isSessionCheck()) showCheckResult(result);
    else showResult(result);
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
  // percentage is null when nothing could be graded, which must not read as 0%.
  el.scoreDisplay.textContent =
    typeof result.percentage === 'number' ? `${Math.round(result.percentage)}%` : '—';
  el.feedbackDisplay.textContent =
    typeof result.percentage === 'number'
      ? result.feedback || 'Answers recorded.'
      : 'This one could not be scored, so nothing was recorded.';
}

/**
 * A single check reports a mark out of the question's points, not a percentage,
 * and `correct: null` means grading was unavailable — never "wrong".
 */
function showCheckResult(result) {
  el.quizSection.classList.add('hidden');
  el.resultSection.classList.remove('hidden');

  el.scoreDisplay.textContent =
    result.score === null || result.score === undefined
      ? '—'
      : `${result.score}/${result.maxScore}`;

  el.feedbackDisplay.textContent =
    result.correct === null
      ? 'This one could not be scored, so nothing was recorded.'
      : result.feedback || (result.correct ? 'That holds up.' : 'Not quite.');
}

async function skipQuiz() {
  stopTimer();

  try {
    const { accessToken } = await chrome.storage.local.get('accessToken');
    if (accessToken && quiz?.id) {
      const apiBase = await getApiBase();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      await (isSessionCheck()
        ? fetch(`${apiBase}/session/check/skip`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ checkId: quiz.id, sessionId: quiz.sessionId }),
          })
        : fetch(`${apiBase}/context-quiz/skip`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ quizId: quiz.id }),
          }));
    }
  } catch {
    // Skipping is best-effort; never block closing the window.
  }

  chrome.storage.local.remove('pendingQuiz', () => window.close());
}
