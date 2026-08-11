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
const API_BASE = () => vscode.workspace.getConfiguration('learningos').get('apiUrl') || 'http://localhost:3001/api';
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
    // Restore state
    accessToken = context.globalState.get('accessToken');
    trackingEnabled = context.globalState.get('trackingEnabled') ?? true;
    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'learningos.toggleTracking';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('learningos.login', () => login(context)), vscode.commands.registerCommand('learningos.logout', () => logout(context)), vscode.commands.registerCommand('learningos.startSession', () => startSession()), vscode.commands.registerCommand('learningos.endSession', () => endSession()), vscode.commands.registerCommand('learningos.toggleTracking', () => toggleTracking(context)), vscode.commands.registerCommand('learningos.showStats', () => showStats()));
    if (!trackingEnabled)
        return;
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
    const panel = vscode.window.createWebviewPanel('learningosQuiz', `Quick Check: ${quiz.topic}`, vscode.ViewColumn.Beside, { enableScripts: true });
    const questionsHtml = quiz.questions.map((q, i) => `
    <div class="question">
      <p class="qnum">Question ${i + 1}</p>
      <p class="qtext">${escapeHtml(q.text)}</p>
      <textarea id="a-${q.id}" placeholder="Your answer..."></textarea>
    </div>
  `).join('');
    const qIds = JSON.stringify(quiz.questions.map((q) => q.id));
    panel.webview.html = `<!DOCTYPE html>
<html><head><style>
body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
h2 { font-size: 16px; margin-bottom: 4px; }
.topic { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
.question { margin-bottom: 14px; }
.qnum { font-size: 10px; font-weight: 600; text-transform: uppercase; opacity: 0.6; margin-bottom: 4px; }
.qtext { font-size: 13px; margin-bottom: 8px; line-height: 1.4; }
textarea { width: 100%; min-height: 60px; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: inherit; font-size: 12px; resize: vertical; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
button { padding: 8px 16px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
.btn-p { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-s { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
#result { display: none; text-align: center; padding: 20px; }
#result .score { font-size: 36px; font-weight: bold; }
#status { font-size: 11px; margin-top: 8px; opacity: 0.7; }
</style></head><body>
<div id="quizView">
<h2>Quick Knowledge Check</h2>
<p class="topic">${escapeHtml(quiz.topic)}</p>
${questionsHtml}
<div class="actions">
<button class="btn-s" onclick="skip()">Skip</button>
<button class="btn-p" onclick="submit()">Submit</button>
</div>
<p id="status"></p>
</div>
<div id="result">
<p class="score" id="scoreVal">—</p>
<p id="fbVal"></p>
</div>
<script>
const vscode = acquireVsCodeApi();
const QS = ${qIds};
const QUIZ_ID = "${quiz.id}";

function submit() {
  document.getElementById('status').textContent = 'Scoring...';
  const answers = QS.map(id => ({ questionId: id, answer: (document.getElementById('a-'+id)||{}).value||'' }));
  vscode.postMessage({ type: 'submit', quizId: QUIZ_ID, answers });
}
function skip() {
  vscode.postMessage({ type: 'skip', quizId: QUIZ_ID });
}
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'result') {
    document.getElementById('quizView').style.display = 'none';
    document.getElementById('result').style.display = 'block';
    document.getElementById('scoreVal').textContent = msg.percentage + '%';
    document.getElementById('fbVal').textContent = msg.feedback || 'Done!';
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
                const result = await res.json();
                panel.webview.postMessage({ type: 'result', percentage: result.percentage || 0, feedback: result.feedback || '' });
            }
            catch {
                panel.webview.postMessage({ type: 'result', percentage: 0, feedback: 'Error scoring.' });
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
        statusBarItem.text = '$(circle-slash) LearningOS: Sign in';
        statusBarItem.tooltip = 'Click to sign in';
        return;
    }
    if (!trackingEnabled) {
        statusBarItem.text = '$(debug-pause) LearningOS: Paused';
        statusBarItem.tooltip = 'Click to resume tracking';
        return;
    }
    const queueSize = eventQueue.length;
    statusBarItem.text = `$(eye) LearningOS: ${queueSize} events`;
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
        await fetch(`${API_BASE()}/ingest/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ events }),
        });
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
    vscode.window.showInformationMessage(`LearningOS: Tracking ${trackingEnabled ? 'resumed' : 'paused'}`);
}
function showStats() {
    const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000 / 60) : 0;
    vscode.window.showInformationMessage(`LearningOS Stats: ${codingTime}m coding · ${filesEdited.size} files · ${buildCount} builds · ${errorsFixed} errors fixed · ${eventQueue.length} queued events`);
}
async function login(context) {
    const email = await vscode.window.showInputBox({ prompt: 'LearningOS Email', placeHolder: 'your@email.com' });
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
            vscode.window.showErrorMessage('LearningOS: Login failed. Check your credentials.');
            return;
        }
        const data = await res.json();
        accessToken = data.accessToken;
        await context.globalState.update('accessToken', accessToken);
        vscode.window.showInformationMessage(`LearningOS: Welcome, ${data.user.name}!`);
        updateStatusBar();
        startSession();
    }
    catch {
        vscode.window.showErrorMessage('LearningOS: Cannot connect to API.');
    }
}
async function logout(context) {
    accessToken = undefined;
    await context.globalState.update('accessToken', undefined);
    updateStatusBar();
    vscode.window.showInformationMessage('LearningOS: Signed out.');
}
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
//# sourceMappingURL=extension.js.map