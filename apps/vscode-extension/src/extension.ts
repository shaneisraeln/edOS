import * as vscode from 'vscode';

const API_BASE = () =>
  vscode.workspace.getConfiguration('edos').get<string>('apiUrl') || 'http://localhost:3001/api';

let accessToken: string | undefined;
let sessionId: string | undefined;
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
  // Restore state
  accessToken = context.globalState.get('accessToken');
  trackingEnabled = context.globalState.get('trackingEnabled') ?? true;

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

  if (!trackingEnabled) return;

  // Track file opens
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!trackingEnabled || !editor) return;
      handleFileSwitch(editor.document);
    }),
  );

  // Track file saves
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!trackingEnabled) return;
      trackFileSave(doc);
    }),
  );

  // Track diagnostics changes (errors fixed)
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      if (!trackingEnabled) return;
      trackDiagnostics(e);
    }),
  );

  // Track terminal commands (builds)
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(() => {
      if (!trackingEnabled) return;
      buildCount++;
      queueEvent('BuildTriggered', { buildCount });
    }),
  );

  // Track typing activity for idle detection
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      if (!trackingEnabled) return;
      lastActiveTime = Date.now();
      resetIdleTimer();
    }),
  );

  // Start sync loop
  syncInterval = setInterval(syncEvents, 30000);

  // Start coding timer
  codingStartTime = Date.now();

  // Auto-start session if logged in
  if (accessToken) {
    startSession();
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
    // User has been idle for 5 minutes — trigger quiz if enough coding time
    const codingTime = codingStartTime ? Math.round((Date.now() - codingStartTime) / 1000) : 0;
    if (codingTime >= MIN_QUIZ_TIME_S && accessToken) {
      triggerQuiz();
    }
  }, IDLE_THRESHOLD_MS);
}

async function triggerQuiz() {
  if (!accessToken) return;

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

  const questionsHtml = quiz.questions.map((q: any, i: number) => `
    <div class="question">
      <p class="qnum">Question ${i + 1}</p>
      <p class="qtext">${escapeHtml(q.text)}</p>
      <textarea id="a-${q.id}" placeholder="Your answer..."></textarea>
    </div>
  `).join('');

  const qIds = JSON.stringify(quiz.questions.map((q: any) => q.id));

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
        const result: any = await res.json();
        panel.webview.postMessage({ type: 'result', percentage: result.percentage || 0, feedback: result.feedback || '' });
      } catch {
        panel.webview.postMessage({ type: 'result', percentage: 0, feedback: 'Error scoring.' });
      }
    }
    if (msg.type === 'skip') {
      fetch(`${API_BASE()}/context-quiz/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ quizId: msg.quizId }),
      }).catch(() => {});
      panel.dispose();
    }
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
  if (!accessToken || !trackingEnabled) return;

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
  if (!accessToken) return;

  try {
    const topic = vscode.workspace.name || 'Coding Session';
    const res = await fetch(`${API_BASE()}/learning/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ topic }),
    });

    if (res.ok) {
      const data: any = await res.json();
      sessionId = data.id;
      codingStartTime = Date.now();
    }
  } catch (e) {
    // Silent
  }
}

async function endSession() {
  if (!accessToken || !sessionId) return;

  try {
    await fetch(`${API_BASE()}/learning/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ sessionId }),
    });
  } catch {}
  sessionId = undefined;
}

// --- Sync ---

async function syncEvents() {
  if (eventQueue.length === 0 || !accessToken) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    await fetch(`${API_BASE()}/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ events }),
    });
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
