"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const API_BASE = () => vscode.workspace.getConfiguration('edos').get('apiUrl') || 'http://localhost:3001/api';
let accessToken;
let sessionId;
let eventQueue = [];
let syncInterval;
let statusBarItem;
let trackingEnabled = true;
let codingStartTime;
let lastActiveFile;
let lastActiveTime = Date.now();
let idleTimeout;
let totalCodingSeconds = 0;
let filesEdited = new Set();
let errorsFixed = 0;
let buildCount = 0;
// Idle threshold: if no activity for 5 minutes, trigger quiz
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
// Min coding time to trigger quiz
const MIN_QUIZ_TIME_S = 60;
function activate(context) {
    // Restore state. The `edos.enabled` setting provides the default; a manual
    // toggle stored in globalState takes precedence over it.
    accessToken = context.globalState.get('accessToken');
    const configuredDefault = vscode.workspace
        .getConfiguration('edos')
        .get('enabled', true);
    trackingEnabled = context.globalState.get('trackingEnabled') ?? configuredDefault;
    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'edos.toggleTracking';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('edos.login', () => login(context)), vscode.commands.registerCommand('edos.logout', () => logout(context)), vscode.commands.registerCommand('edos.startSession', () => startSession()), vscode.commands.registerCommand('edos.endSession', () => endSession()), vscode.commands.registerCommand('edos.toggleTracking', () => toggleTracking(context)), vscode.commands.registerCommand('edos.showStats', () => showStats()));
    // Listeners are registered unconditionally and each one checks
    // `trackingEnabled` at call time. Returning early here would mean a user who
    // paused tracking could never resume it without reloading the window,
    // because the listeners would never have been attached.
    // Track file opens
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!trackingEnabled || !editor)
            return;
        handleFileSwitch(editor.document);
    }));
    // Track file saves
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!trackingEnabled)
            return;
        trackFileSave(doc);
    }));
    // Track diagnostics changes (errors fixed)
    context.subscriptions.push(vscode.languages.onDidChangeDiagnostics((e) => {
        if (!trackingEnabled)
            return;
        trackDiagnostics(e);
    }));
    // Track terminal commands (builds)
    context.subscriptions.push(vscode.window.onDidOpenTerminal(() => {
        if (!trackingEnabled)
            return;
        buildCount++;
        queueEvent('BuildTriggered', { buildCount });
    }));
    // Track typing activity for idle detection
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(() => {
        if (!trackingEnabled)
            return;
        lastActiveTime = Date.now();
        resetIdleTimer();
    }));
    // Start sync loop
    syncInterval = setInterval(syncEvents, 30000);
    // Start coding timer
    codingStartTime = Date.now();
    // Auto-start session if logged in
    if (accessToken) {
        startSession();
    }
}
function deactivate() {
    if (syncInterval)
        clearInterval(syncInterval);
    if (idleTimeout)
        clearTimeout(idleTimeout);
    syncEvents();
    if (sessionId)
        endSession();
}
// --- Idle Detection & Quiz Trigger ---
function resetIdleTimer() {
    if (idleTimeout)
        clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        const quizOnIdle = vscode.workspace
            .getConfiguration('edos')
            .get('quizOnIdle', true);
        if (!quizOnIdle)
            return;
        // User has been idle for 5 minutes — trigger quiz if enough coding time
        const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000) : 0;
        if (codingTime >= MIN_QUIZ_TIME_S && accessToken) {
            triggerQuiz();
        }
    }, IDLE_THRESHOLD_MS);
}
async function triggerQuiz() {
    if (!accessToken)
        return;
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
        if (!res.ok)
            return;
        const quiz = await res.json();
        if (quiz.skipped || !quiz.questions?.length)
            return;
        // Show quiz as a VS Code webview panel
        showQuizPanel(quiz);
    }
    catch (e) {
        // Silent fail — don't interrupt coding
    }
    // Reset coding metrics
    codingStartTime = Date.now();
    filesEdited.clear();
    errorsFixed = 0;
    buildCount = 0;
}
function showQuizPanel(quiz) {
    const panel = vscode.window.createWebviewPanel('edosQuiz', `Quick Check: ${quiz.topic}`, vscode.ViewColumn.Beside, { enableScripts: true });
    const total = quiz.questions.length;
    const questionsHtml = quiz.questions.map((q, i) => `
    <div class="question">
      <p class="qnum">${i + 1} of ${total}</p>
      <p class="qtext">${escapeHtml(q.text)}</p>
      <textarea id="a-${escapeHtml(q.id)}" placeholder="Your answer" aria-label="Answer to question ${i + 1}"></textarea>
    </div>
  `).join('');
    const qIds = JSON.stringify(quiz.questions.map((q) => q.id));
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
    document.getElementById('scoreVal').textContent = Math.round(msg.percentage || 0) + '%';
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
    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'submit') {
            try {
                const res = await fetch(`${API_BASE()}/context-quiz/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                    body: JSON.stringify({ quizId: msg.quizId, answers: msg.answers }),
                });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                const result = await res.json();
                panel.webview.postMessage({
                    type: 'result',
                    percentage: result.percentage || 0,
                    feedback: result.feedback || '',
                });
            }
            catch (err) {
                // Report the failure so the user can retry, rather than showing a
                // misleading 0% score as if they had been graded.
                panel.webview.postMessage({
                    type: 'error',
                    message: `Could not submit: ${err?.message || 'unknown error'}`,
                });
            }
        }
        if (msg.type === 'skip') {
            fetch(`${API_BASE()}/context-quiz/skip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ quizId: msg.quizId }),
            }).catch(() => { });
            panel.dispose();
        }
    });
}
// --- Tracking ---
function handleFileSwitch(document) {
    const fileName = document.fileName;
    if (fileName === lastActiveFile)
        return;
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
function trackFileSave(document) {
    filesEdited.add(document.fileName);
    queueEvent('FileSaved', {
        file: document.fileName.split(/[/\\]/).pop(),
        language: document.languageId,
        lines: document.lineCount,
        project: vscode.workspace.name || 'Unknown',
    });
}
function trackDiagnostics(e) {
    for (const uri of e.uris) {
        const diags = vscode.languages.getDiagnostics(uri);
        const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        // If errors decreased, user fixed something
        if (errors.length === 0) {
            errorsFixed++;
        }
    }
}
function queueEvent(eventType, metadata) {
    if (!accessToken || !trackingEnabled)
        return;
    eventQueue.push({
        eventType,
        source: 'ide',
        timestamp: new Date().toISOString(),
        topic: detectTopic(metadata),
        sessionId,
        metadata,
    });
    updateStatusBar();
}
function detectTopic(metadata) {
    const lang = metadata.language;
    if (lang === 'python')
        return 'Python Development';
    if (lang === 'typescript' || lang === 'javascript')
        return 'Web Development';
    if (lang === 'rust')
        return 'Rust Development';
    if (lang === 'go')
        return 'Go Development';
    if (lang === 'java')
        return 'Java Development';
    if (lang === 'cpp' || lang === 'c')
        return 'C/C++ Development';
    if (metadata.file?.includes('test'))
        return 'Testing';
    if (metadata.file?.endsWith('.md'))
        return 'Documentation';
    return metadata.project || 'Coding';
}
// --- Status Bar ---
function updateStatusBar() {
    if (!accessToken) {
        statusBarItem.text = '$(circle-slash) edOS: Sign in';
        statusBarItem.tooltip = 'Click to sign in';
        return;
    }
    if (!trackingEnabled) {
        statusBarItem.text = '$(debug-pause) edOS: Paused';
        statusBarItem.tooltip = 'Click to resume tracking';
        return;
    }
    const queueSize = eventQueue.length;
    statusBarItem.text = `$(eye) edOS: ${queueSize} events`;
    statusBarItem.tooltip = `Tracking active · ${filesEdited.size} files edited · Click to pause`;
}
// --- Session Management ---
async function startSession() {
    if (!accessToken)
        return;
    try {
        const topic = vscode.workspace.name || 'Coding Session';
        const res = await fetch(`${API_BASE()}/learning/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ topic }),
        });
        if (res.ok) {
            const data = await res.json();
            sessionId = data.id;
            codingStartTime = Date.now();
        }
    }
    catch (e) {
        // Silent
    }
}
async function endSession() {
    if (!accessToken || !sessionId)
        return;
    try {
        await fetch(`${API_BASE()}/learning/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ sessionId }),
        });
    }
    catch { }
    sessionId = undefined;
}
// --- Sync ---
async function syncEvents() {
    if (eventQueue.length === 0 || !accessToken)
        return;
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
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
    }
    catch {
        eventQueue.unshift(...events);
    }
    updateStatusBar();
}
// --- Commands ---
function toggleTracking(context) {
    trackingEnabled = !trackingEnabled;
    context.globalState.update('trackingEnabled', trackingEnabled);
    updateStatusBar();
    vscode.window.showInformationMessage(`edOS: Tracking ${trackingEnabled ? 'resumed' : 'paused'}`);
}
function showStats() {
    const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000 / 60) : 0;
    vscode.window.showInformationMessage(`edOS Stats: ${codingTime}m coding · ${filesEdited.size} files · ${buildCount} builds · ${errorsFixed} errors fixed · ${eventQueue.length} queued events`);
}
async function login(context) {
    const email = await vscode.window.showInputBox({ prompt: 'edOS Email', placeHolder: 'your@email.com' });
    if (!email)
        return;
    const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
    if (!password)
        return;
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
        const data = await res.json();
        accessToken = data.accessToken;
        await context.globalState.update('accessToken', accessToken);
        vscode.window.showInformationMessage(`edOS: Welcome, ${data.user.name}!`);
        updateStatusBar();
        startSession();
    }
    catch {
        vscode.window.showErrorMessage('edOS: Cannot connect to API.');
    }
}
async function logout(context) {
    accessToken = undefined;
    await context.globalState.update('accessToken', undefined);
    updateStatusBar();
    vscode.window.showInformationMessage('edOS: Signed out.');
}
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
//# sourceMappingURL=extension.js.map