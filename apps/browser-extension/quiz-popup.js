const API_BASE = 'http://localhost:3001/api';
let quiz = null;
let timeLeft = 180;
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure storage is written before we read
  setTimeout(loadQuiz, 300);
});

function loadQuiz() {
  chrome.storage.local.get(['pendingQuiz', 'accessToken'], (data) => {
    quiz = data.pendingQuiz;

    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
      document.getElementById('loading').textContent = 'No quiz available.';
      setTimeout(() => window.close(), 2000);
      return;
    }

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('quizSection').classList.remove('hidden');
    document.getElementById('topicBadge').textContent = quiz.topic || 'Learning Session';

    // Render questions
    const container = document.getElementById('questions');
    container.innerHTML = '';
    quiz.questions.forEach((q, i) => {
      const div = document.createElement('div');
      div.className = 'question';
      div.innerHTML = `
        <div class="question-number">Question ${i + 1}</div>
        <div class="question-text">${escapeHtml(q.text)}</div>
        <textarea id="answer-${q.id}" placeholder="Type your answer..." oninput="checkAnswers()"></textarea>
      `;
      container.appendChild(div);
    });

    // Start timer
    timeLeft = quiz.timeLimit || 180;
    updateTimer();
    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimer();
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        submitQuiz();
      }
    }, 1000);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function updateTimer() {
  const min = Math.floor(timeLeft / 60);
  const sec = timeLeft % 60;
  document.getElementById('timer').textContent = `Time remaining: ${min}:${sec.toString().padStart(2, '0')}`;
}

function checkAnswers() {
  if (!quiz || !quiz.questions) return;
  const hasAnswer = quiz.questions.some(q => {
    const el = document.getElementById(`answer-${q.id}`);
    return el && el.value.trim().length > 0;
  });
  document.getElementById('submitBtn').disabled = !hasAnswer;
}

function submitQuiz() {
  if (timerInterval) clearInterval(timerInterval);

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Scoring...';

  const answers = quiz.questions.map(q => ({
    questionId: q.id,
    answer: (document.getElementById(`answer-${q.id}`) || {}).value || '',
  }));

  chrome.storage.local.get('accessToken', (data) => {
    const token = data.accessToken;
    if (!token) {
      showError('Not signed in. Please sign in via the extension popup first.');
      return;
    }

    fetch(`${API_BASE}/context-quiz/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ quizId: quiz.id, answers }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(result => {
        // Show result
        document.getElementById('quizSection').classList.add('hidden');
        document.getElementById('resultSection').classList.remove('hidden');
        document.getElementById('scoreDisplay').textContent = `${result.percentage || 0}%`;
        document.getElementById('feedbackDisplay').textContent = result.feedback || 'Quiz complete!';

        // Clear pending quiz
        chrome.storage.local.remove('pendingQuiz');
      })
      .catch(err => {
        showError(`Failed to submit: ${err.message}. You can close this window.`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      });
  });
}

function skipQuiz() {
  if (timerInterval) clearInterval(timerInterval);

  chrome.storage.local.get('accessToken', (data) => {
    const token = data.accessToken;
    if (token && quiz && quiz.id) {
      fetch(`${API_BASE}/context-quiz/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ quizId: quiz.id }),
      }).catch(() => {});
    }

    chrome.storage.local.remove('pendingQuiz');
    window.close();
  });
}

function showError(msg) {
  const errEl = document.getElementById('error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  } else {
    alert(msg);
  }
}
