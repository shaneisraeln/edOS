import * as vscode from 'vscode';

const API_BASE = () =>
  vscode.workspace.getConfiguration('edos').get<string>('apiUrl') || 'http://localhost:3001/api';

/** This extension's surface identity in the shared session. */
const SURFACE = 'ide';

/**
 * How often to check in with the server. Deliberately well below the server's
 * knowledge-check interval so a due check is picked up promptly.
 */
const PULSE_INTERVAL_MS = 10_000;

/** Flush queued events every third pulse, so batching still happens. */
const FLUSH_EVERY_N_TICKS = 3;

let accessToken: string | undefined;
let sessionId: string | undefined;
/** The shared session, as last reported by the API. Null when none is running. */
let activeSession: any | null = null;
/** Session we already reported as ended, so the notice appears exactly once. */
let lastWrapUpSessionId: string | undefined;
let eventQueue: any[] = [];
let syncInterval: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;
let trackingEnabled = true;
let codingStartTime: number | undefined;
let lastActiveFile: string | undefined;
let lastActiveTime: number = Date.now();
let idleTimeout: NodeJS.Timeout | undefined;
let totalCodingSeconds = 0;
let filesEdited = new Set<string>();
let errorsFixed = 0;
let buildCount = 0;

// Idle threshold: if no activity for 5 minutes, trigger quiz
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
// Min coding time to trigger quiz
const MIN_QUIZ_TIME_S = 60;

export function activate(context: vscode.ExtensionContext) {
  // Restore state. The `edos.enabled` setting provides the default; a manual
  // toggle stored in globalState takes precedence over it.
  accessToken = context.globalState.get('accessToken');
  const configuredDefault = vscode.workspace
    .getConfiguration('edos')
    .get<boolean>('enabled', true);
  trackingEnabled = context.globalState.get<boolean>('trackingEnabled') ?? configuredDefault;

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'edos.toggleTracking';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('edos.login', () => login(context)),
    vscode.commands.registerCommand('edos.logout', () => logout(context)),
    vscode.commands.registerCommand('edos.startSession', () => startSession()),
    vscode.commands.registerCommand('edos.endSession', () => endSession()),
    vscode.commands.registerCommand('edos.toggleTracking', () => toggleTracking(context)),
    vscode.commands.registerCommand('edos.showStats', () => showStats()),
  );

  // Listeners are registered unconditionally and each one checks
  // `trackingEnabled` at call time. Returning early here would mean a user who
  // paused tracking could never resume it without reloading the window,
  // because the listeners would never have been attached.

  // Track file opens
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!shouldCapture() || !editor) return;
      handleFileSwitch(editor.document);
    }),
  );

  // Track file saves
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!shouldCapture()) return;
      trackFileSave(doc);
    }),
  );

  // Track diagnostics changes (errors fixed)
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      if (!shouldCapture()) return;
      trackDiagnostics(e);
    }),
  );

  // Track terminal commands (builds)
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(() => {
      if (!shouldCapture()) return;
      buildCount++;
      queueEvent('BuildTriggered', { buildCount });
    }),
  );

  // Track typing activity for idle detection
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      if (!shouldCapture()) return;
      lastActiveTime = Date.now();
      resetIdleTimer();
    }),
  );

  // The pulse has to run well inside the server's check interval, otherwise a
  // check comes due and then waits for the next tick. Event flushing stays on
  // the slower cadence because batching is the point.
  let ticksSinceFlush = 0;
  syncInterval = setInterval(async () => {
    await syncSession();

    ticksSinceFlush += 1;
    if (ticksSinceFlush >= FLUSH_EVERY_N_TICKS) {
      ticksSinceFlush = 0;
      if (shouldCapture()) await syncEvents();
    }
  }, PULSE_INTERVAL_MS);

  codingStartTime = Date.now();

  // Attach to a session that may already be running elsewhere. This replaces
  // the old auto-start, which minted a fresh session on every window open.
  if (accessToken) {
    syncSession();
  }
}

export function deactivate() {
  if (syncInterval) clearInterval(syncInterval);
  if (idleTimeout) clearTimeout(idleTimeout);
  syncEvents();
  if (sessionId) endSession();
}

// --- Idle Detection & Quiz Trigger ---

function resetIdleTimer() {
  if (idleTimeout) clearTimeout(idleTimeout);
  idleTimeout = setTimeout(() => {
    const quizOnIdle = vscode.workspace
      .getConfiguration('edos')
      .get<boolean>('quizOnIdle', true);
    if (!quizOnIdle) return;

    // User has been idle for 5 minutes — trigger quiz if enough coding time
    const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000) : 0;
    if (codingTime >= MIN_QUIZ_TIME_S && accessToken) {
      triggerQuiz();
    }
  }, IDLE_THRESHOLD_MS);
}

async function triggerQuiz() {
  // Only quiz on work that belongs to a real session.
  if (!shouldCapture()) return;

  const project = vscode.workspace.name || 'Unknown Project';
  const language = vscode.window.activeTextEditor?.document.languageId || 'unknown';
  const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000) : 0;

  const context = `The user was coding in ${language} on project "${project}" for ${Math.round(codingTime / 60)} minutes. They edited ${filesEdited.size} files, triggered ${buildCount} builds, and fixed ${errorsFixed} errors.`;

  try {
    const res = await fetch(`${API_BASE()}/context-quiz/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        context,
        source: 'ide',
        title: `${language} — ${project}`,
        timeSpent: codingTime,
        topics: [language, project],
      }),
    });

    if (!res.ok) return;
    const quiz: any = await res.json();

    if (quiz.skipped || !quiz.questions?.length) return;

    // Show quiz as a VS Code webview panel
    showQuizPanel(quiz);
  } catch (e) {
    // Silent fail — don't interrupt coding
  }

  // Reset coding metrics
  codingStartTime = Date.now();
  filesEdited.clear();
  errorsFixed = 0;
  buildCount = 0;
}

function showQuizPanel(quiz: any) {
  const panel = vscode.window.createWebviewPanel(
    'edosQuiz',
    `Quick Check: ${quiz.topic}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );

  const total = quiz.questions.length;
  const questionsHtml = quiz.questions.map((q: any, i: number) => `
    <div class="question">
      <p class="qnum">${i + 1} of ${total}</p>
      <p class="qtext">${escapeHtml(q.text)}</p>
      <textarea id="a-${escapeHtml(q.id)}" placeholder="Your answer" aria-label="Answer to question ${i + 1}"></textarea>
    </div>
  `).join('');

  const qIds = JSON.stringify(quiz.questions.map((q: any) => q.id));

  panel.webview.html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
/* Inherits VS Code theme tokens so it matches whatever theme the user runs. */
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  font-size: 13px;
  line-height: 1.5;
  padding: 22px 20px;
  color: var(--vscode-foreground);
  max-width: 560px;
}
.eyebrow { font-size: 11px; opacity: 0.6; margin-bottom: 2px; }
h1 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 18px; }
.question {
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  border-radius: 10px;
  padding: 14px;
}
.question + .question { margin-top: 14px; }
.qnum { font-size: 11px; opacity: 0.6; font-variant-numeric: tabular-nums; margin-bottom: 6px; }
.qtext { font-size: 13px; line-height: 1.5; margin-bottom: 10px; }
textarea {
  width: 100%; min-height: 74px; padding: 9px 11px;
  font-family: inherit; font-size: 13px; line-height: 1.5;
  border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.25));
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 8px; resize: vertical;
}
textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.actions { display: flex; gap: 8px; margin-top: 18px; }
button {
  flex: 1; padding: 9px 14px; font-family: inherit; font-size: 13px; font-weight: 500;
  border: 1px solid transparent; border-radius: 8px; cursor: pointer;
}
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
.btn-solid { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-solid:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.btn-solid:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost {
  background: transparent; opacity: 0.85;
  color: var(--vscode-foreground);
  border-color: var(--vscode-panel-border, rgba(128,128,128,0.25));
}
.btn-ghost:hover { opacity: 1; }
#status { display: none; margin-top: 12px; font-size: 12px; color: var(--vscode-errorForeground); }
#status.visible { display: block; }
#result { display: none; text-align: center; padding: 44px 8px; }
#result .score {
  font-size: 44px; font-weight: 600; letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums; line-height: 1.1; margin: 6px 0 10px;
}
#result .fb { font-size: 13px; opacity: 0.7; line-height: 1.55; max-width: 34ch; margin: 0 auto; }
</style></head><body>
<main id="quizView">
  <p class="eyebrow">Quick check</p>
  <h1>${escapeHtml(quiz.topic)}</h1>
  ${questionsHtml}
  <div class="actions">
    <button type="button" class="btn-ghost" id="skipBtn">Skip</button>
    <button type="button" class="btn-solid" id="submitBtn" disabled>Submit</button>
  </div>
  <p id="status" role="alert"></p>
</main>
<section id="result">
  <p class="eyebrow">Your score</p>
  <p class="score" id="scoreVal">—</p>
  <p class="fb" id="fbVal"></p>
</section>
<script>
const vscode = acquireVsCodeApi();
const QS = ${qIds};
const QUIZ_ID = ${JSON.stringify(quiz.id)};

const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('status');

function fieldFor(id) { return document.getElementById('a-' + id); }

function refreshSubmitState() {
  const answered = QS.some(id => {
    const f = fieldFor(id);
    return f && f.value.trim().length > 0;
  });
  submitBtn.disabled = !answered;
}

QS.forEach(id => {
  const f = fieldFor(id);
  if (f) f.addEventListener('input', refreshSubmitState);
});

submitBtn.addEventListener('click', () => {
  submitBtn.disabled = true;
  submitBtn.textContent = 'Scoring';
  statusEl.classList.remove('visible');
  const answers = QS.map(id => {
    const f = fieldFor(id);
    return { questionId: id, answer: f ? f.value.trim() : '' };
  });
  vscode.postMessage({ type: 'submit', quizId: QUIZ_ID, answers });
});

document.getElementById('skipBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'skip', quizId: QUIZ_ID });
});

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'result') {
    document.getElementById('quizView').style.display = 'none';
    document.getElementById('result').style.display = 'block';
    // Pre-formatted by the extension: a check reports marks, a quiz reports a
    // percentage, and an ungradable answer reports neither.
    document.getElementById('scoreVal').textContent = msg.scoreLabel || '—';
    document.getElementById('fbVal').textContent = msg.feedback || 'Answers recorded.';
  }
  if (msg.type === 'error') {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
    statusEl.textContent = msg.message || 'Could not submit.';
    statusEl.classList.add('visible');
  }
});
</script></body></html>`;

  // A recurring session check and a context quiz are graded by different
  // endpoints with different payloads, so the panel remembers which it is.
  const isCheck = quiz.kind === 'session-check';

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'submit') {
      try {
        const res = isCheck
          ? await fetch(`${API_BASE()}/session/check/answer`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                checkId: quiz.id,
                answer: msg.answers?.[0]?.answer ?? '',
                sessionId: quiz.sessionId,
              }),
            })
          : await fetch(`${API_BASE()}/context-quiz/submit`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ quizId: msg.quizId, answers: msg.answers }),
            });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result: any = await res.json();

        if (isCheck) {
          // A single check is marked out of the question's points, and
          // correct === null means grading was unavailable, never "wrong".
          panel.webview.postMessage({
            type: 'result',
            scoreLabel:
              result.score === null || result.score === undefined
                ? '—'
                : `${result.score}/${result.maxScore}`,
            feedback:
              result.correct === null
                ? 'This one could not be scored, so nothing was recorded.'
                : result.feedback || (result.correct ? 'That holds up.' : 'Not quite.'),
          });
        } else {
          // percentage is null when nothing was gradable; showing 0% would read
          // as a failed answer rather than a failed grader.
          panel.webview.postMessage({
            type: 'result',
            scoreLabel:
              typeof result.percentage === 'number'
                ? `${Math.round(result.percentage)}%`
                : '—',
            feedback:
              typeof result.percentage === 'number'
                ? result.feedback || 'Answers recorded.'
                : 'This one could not be scored, so nothing was recorded.',
          });
        }
      } catch (err: any) {
        // Report the failure so the user can retry, rather than showing a
        // misleading 0% score as if they had been graded.
        panel.webview.postMessage({
          type: 'error',
          message: `Could not submit: ${err?.message || 'unknown error'}`,
        });
      }
    }

    if (msg.type === 'skip') {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      (isCheck
        ? fetch(`${API_BASE()}/session/check/skip`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ checkId: quiz.id, sessionId: quiz.sessionId }),
          })
        : fetch(`${API_BASE()}/context-quiz/skip`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ quizId: msg.quizId }),
          })
      ).catch(() => {});

      panel.dispose();
    }
  });
}

/**
 * Present a recurring knowledge check in the editor.
 *
 * Reuses the quiz webview so there is one panel implementation, with `kind`
 * telling it which endpoints to submit to.
 */
function showCheckPanel(check: any): void {
  showQuizPanel({
    kind: 'session-check',
    id: check.id,
    sessionId: check.sessionId,
    topic: check.topic || activeSession?.topic || 'Knowledge check',
    questions: [{ id: check.id, text: check.question }],
  });
}

// --- Tracking ---

function handleFileSwitch(document: vscode.TextDocument) {
  const fileName = document.fileName;
  if (fileName === lastActiveFile) return;

  // Log time on previous file
  if (lastActiveFile && codingStartTime) {
    const timeOnFile = Math.round((Date.now() - lastActiveTime) / 1000);
    if (timeOnFile > 5) {
      queueEvent('FileViewed', {
        file: lastActiveFile.split(/[/\\]/).pop(),
        language: document.languageId,
        seconds: timeOnFile,
      });
    }
  }

  lastActiveFile = fileName;
  lastActiveTime = Date.now();
  filesEdited.add(fileName);

  queueEvent('FileOpened', {
    file: fileName.split(/[/\\]/).pop(),
    language: document.languageId,
    project: vscode.workspace.name || 'Unknown',
    lines: document.lineCount,
  });

  updateStatusBar();
}

function trackFileSave(document: vscode.TextDocument) {
  filesEdited.add(document.fileName);
  queueEvent('FileSaved', {
    file: document.fileName.split(/[/\\]/).pop(),
    language: document.languageId,
    lines: document.lineCount,
    project: vscode.workspace.name || 'Unknown',
  });
}

function trackDiagnostics(e: vscode.DiagnosticChangeEvent) {
  for (const uri of e.uris) {
    const diags = vscode.languages.getDiagnostics(uri);
    const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
    // If errors decreased, user fixed something
    if (errors.length === 0) {
      errorsFixed++;
    }
  }
}

function queueEvent(eventType: string, metadata: Record<string, any>) {
  if (!shouldCapture()) return;

  eventQueue.push({
    eventType,
    source: SURFACE,
    timestamp: new Date().toISOString(),
    topic: detectTopic(metadata),
    // The shared session id, not one this extension invented.
    sessionId,
    metadata,
  });

  updateStatusBar();
}

function detectTopic(metadata: Record<string, any>): string {
  const lang = metadata.language;
  if (lang === 'python') return 'Python Development';
  if (lang === 'typescript' || lang === 'javascript') return 'Web Development';
  if (lang === 'rust') return 'Rust Development';
  if (lang === 'go') return 'Go Development';
  if (lang === 'java') return 'Java Development';
  if (lang === 'cpp' || lang === 'c') return 'C/C++ Development';
  if (metadata.file?.includes('test')) return 'Testing';
  if (metadata.file?.endsWith('.md')) return 'Documentation';
  return metadata.project || 'Coding';
}

// --- Status Bar ---

/**
 * The status bar distinguishes the three reasons nothing is being captured:
 * not signed in, paused locally, or no session running. Previously it claimed
 * "Tracking active" whenever the toggle was on, even with nothing recording.
 */
function updateStatusBar() {
  if (!accessToken) {
    statusBarItem.text = '$(circle-slash) edOS: Sign in';
    statusBarItem.tooltip = 'Click to sign in';
    return;
  }

  if (!trackingEnabled) {
    statusBarItem.text = '$(debug-pause) edOS: Paused';
    statusBarItem.tooltip = 'Tracking paused in this editor. Click to resume.';
    return;
  }

  if (!activeSession || activeSession.status !== 'active') {
    statusBarItem.text = '$(circle-outline) edOS: No session';
    statusBarItem.tooltip =
      'No learning session running. Start one from the editor, the web app, or the desktop agent.';
    return;
  }

  if (!shouldCapture()) {
    statusBarItem.text = '$(circle-slash) edOS: Not capturing';
    statusBarItem.tooltip =
      'A session is running but editor tracking is disabled in your edOS settings.';
    return;
  }

  statusBarItem.text = `$(eye) edOS: ${eventQueue.length} events`;
  statusBarItem.tooltip = `Capturing "${activeSession.topic}" · ${filesEdited.size} files edited · Click to pause`;
}

// --- Session Management ---

/**
 * Start a shared session from the editor.
 *
 * Idempotent server-side: if the learner already has a session running (started
 * on the web, the desktop agent or the browser), this joins it rather than
 * creating a second one. The extension used to POST /learning/start on every
 * activation, which is how three concurrent "active" sessions appeared.
 */
async function startSession(): Promise<void> {
  if (!accessToken) return;

  try {
    const topic = vscode.workspace.name || 'Coding session';
    const res = await fetch(`${API_BASE()}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ topic, surface: SURFACE, deviceName: deviceLabel() }),
    });

    if (!res.ok) return;
    const data: any = await res.json();
    applySession(data.session);
    codingStartTime = Date.now();
  } catch {
    // Offline is not an error worth interrupting the editor for.
  }
}

/** End the session for every surface, not just this one. */
async function endSession(): Promise<void> {
  if (!accessToken) return;

  try {
    await fetch(`${API_BASE()}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: '{}',
    });
  } catch {
    // ignore
  }
  applySession(null);
}

/**
 * Attach to whatever session is running, or detach if none is.
 *
 * Runs on the existing sync tick, which makes the extension self-healing: a
 * session started on another surface is picked up within one tick without the
 * user touching the editor.
 */
async function syncSession(): Promise<void> {
  if (!accessToken) {
    applySession(null);
    return;
  }

  try {
    const body: Record<string, unknown> = {
      surface: SURFACE,
      deviceName: deviceLabel(),
    };

    // Saying which session we think we are in is what lets the server reply
    // "that one ended" rather than just returning nothing.
    if (activeSession?.id) body.knownSessionId = activeSession.id;

    const res = await fetch(`${API_BASE()}/session/pulse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;

    const data = (await res.json()) as any;
    applySession(data.session ?? null);

    // A check assigned to this surface. The server owns the schedule, so the
    // learner is asked once per interval across every surface rather than once
    // per surface on four different clocks.
    if (data.check) showCheckPanel(data.check);

    if (data.endedSession) reportSessionEnded(data.endedSession);
  } catch {
    // Keep the last known state rather than flapping capture on and off.
  }
}

/**
 * Tell the learner the session finished elsewhere.
 *
 * The extension previously just stopped capturing, which looks identical to it
 * having broken. Guarded so a repeated pulse cannot nag.
 */
function reportSessionEnded(ended: any): void {
  if (lastWrapUpSessionId === ended.id) return;
  lastWrapUpSessionId = ended.id;

  const minutes = Math.round((ended.elapsedSeconds || 0) / 60);
  const where =
    ended.reason === 'abandoned'
      ? 'closed automatically after a long silence'
      : 'ended from another device';

  vscode.window.showInformationMessage(
    `edOS: "${ended.topic}" was ${where}. ${minutes}m studied, ${ended.checkCount || 0} checks. Tracking has stopped.`,
  );
}

function applySession(session: any | null): void {
  activeSession = session;
  sessionId = session?.id;
  updateStatusBar();
}

/**
 * Capture requires a running session that this surface has joined, plus local
 * tracking being enabled. Without the session condition the extension recorded
 * whenever it was installed.
 */
function shouldCapture(): boolean {
  if (!trackingEnabled || !accessToken || !activeSession) return false;
  if (activeSession.status !== 'active') return false;
  return (activeSession.participants || []).some(
    (p: any) => p.surface === SURFACE && p.status !== 'left',
  );
}

function deviceLabel(): string {
  return `${vscode.env.appName}${vscode.workspace.name ? ` — ${vscode.workspace.name}` : ''}`;
}

// --- Sync ---

async function syncEvents() {
  if (eventQueue.length === 0 || !accessToken) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    const res = await fetch(`${API_BASE()}/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ events }),
    });
    // A non-2xx response (expired token, API restarting) must not silently
    // discard the batch — requeue it so the next sync retries.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    eventQueue.unshift(...events);
  }

  updateStatusBar();
}

// --- Commands ---

function toggleTracking(context: vscode.ExtensionContext) {
  trackingEnabled = !trackingEnabled;
  context.globalState.update('trackingEnabled', trackingEnabled);
  updateStatusBar();
  vscode.window.showInformationMessage(`edOS: Tracking ${trackingEnabled ? 'resumed' : 'paused'}`);
}

function showStats() {
  const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000 / 60) : 0;
  vscode.window.showInformationMessage(
    `edOS Stats: ${codingTime}m coding · ${filesEdited.size} files · ${buildCount} builds · ${errorsFixed} errors fixed · ${eventQueue.length} queued events`
  );
}

async function login(context: vscode.ExtensionContext) {
  const email = await vscode.window.showInputBox({ prompt: 'edOS Email', placeHolder: 'your@email.com' });
  if (!email) return;

  const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
  if (!password) return;

  try {
    const res = await fetch(`${API_BASE()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      vscode.window.showErrorMessage('edOS: Login failed. Check your credentials.');
      return;
    }

    const data: any = await res.json();
    accessToken = data.accessToken;
    await context.globalState.update('accessToken', accessToken);
    vscode.window.showInformationMessage(`edOS: Welcome, ${data.user.name}!`);
    updateStatusBar();
    startSession();
  } catch {
    vscode.window.showErrorMessage('edOS: Cannot connect to API.');
  }
}

async function logout(context: vscode.ExtensionContext) {
  accessToken = undefined;
  await context.globalState.update('accessToken', undefined);
  updateStatusBar();
  vscode.window.showInformationMessage('edOS: Signed out.');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
