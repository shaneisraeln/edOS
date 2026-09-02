# edOS — AI Coding Agent Session Transcript

> **Session summary:** Built with Kiro AI coding agent (August 2026).  
> Project: **edOS** — a cross-platform learning OS that tracks study activity across a desktop app, browser extension, VS Code extension, and web dashboard.  
> Repo: https://github.com/shaneisraeln/edOS (branch: `sham`)

---

## What was asked

> "man i guess we need to do few things first we need to fix the ui and then the scoring technique u get me since that the thing is important and then the application — to start the session we need to go to each and every place like vs code or browser or desktop application, i need it in an all in one application so its on both web and desktop/mac. so if the user clicks the start from desktop then it should access all the things like the browser, vs code, desktop — where i need the ui to be minimalist like notion, obsidian, anytype like these u get me so fix that man"

---

## What the agent built across the session

### 1. Minimalist UI redesign (Notion / Obsidian / Anytype feel)

- Built a shared component system: `Button`, `Card`, `Input`, `Textarea`, `Select`, `Switch`, `Segmented`, `Dialog`, `Badge`, `Alert`, `StatusDot`, `ProgressBar`, `MasteryBadge`, `Spinner`, `EmptyState`
- Restyled all 19 dashboard pages: assessment, quiz, interview, history, mentor, graph, settings, timeline, projects, paths, groups, onboarding, admin, college, profile
- Native system font stack. No emoji. No per-page CSS soup. One design token file.
- Tailwind config with custom neutral ramp, primary indigo `#3564d4`, hairline borders, focus rings

### 2. Principled scoring engine (replaced 5 ad-hoc LLM blends)

**Bugs found and fixed:**
- MCQ answers were never stored — the model re-derived the "correct" answer at grading time (not deterministic)
- Parse failure on grading → score 0, indistinguishable from a real zero, fed straight into mastery
- `assessment.questions = scoredQuestions` was destructive — wiped questions on every submit
- `POST /api/graph/update` accepted client-settable `mastery=100` — anyone could forge their own score
- `scoreIntervalQuiz` recovered the question by newest timestamp, not by ID — wrong question graded when multiple surfaces existed

**What was built:**
- `AnswerGraderService` — deterministic grading for MCQ/true-false via stored answer key; model only for open-ended; `unscored` (not zero) when grading fails
- `MasteryService` — evidence-weighted running proportion: `masteryRaw = successMass / totalMass × 100`; `mastery = masteryRaw × retention`; real SM-2 scheduling
- `ConceptResolverService` — exact → fuzzy → create, fixes silent score drops from name mismatches
- `ScoringModule` — single source of truth, `@Global`, exported
- All 8 knowledge-node write sites consolidated through `MasteryService.recordEvidence()`

**Verified live:**
```
MCQ correct  → 20/20, gradeMethod: objective
MCQ wrong    → 0/20, gradeMethod: objective  
Two attempts (100% then 60%) → weighted mastery 86.7 (not a jump to latest)
ATTACK: POST /graph/update mastery=100 → mastery stayed 0
26 exposure touches → mastery 0.00, confidence 27.75 (correct: exposure adds weight, not score)
weaknessScore == 100 − mastery violated in 0 rows
```

### 3. Unified cross-surface session orchestration

**The problem:**  
Starting VS Code, the browser extension, and the desktop agent each minted their own `active` session row. Ingestion used "newest active session wins" as the only link between surfaces. Ending a session notified nobody.

**What was built:**

`SessionService` with:
- `start()` — idempotent; second surface joins instead of creating a rival session
- `pulse()` — ONE call replaces `active → join → heartbeat`; returns `{session, check, endedSession}` so agents learn about due checks AND sessions ended elsewhere
- `grantSurfacePermission()` — pressing Start from a surface is consent; persisted so the agent works next time
- `SessionCheckService` — server-owned 60s schedule; atomic `UPDATE WHERE nextCheckAt <= NOW()` so exactly one surface wins each check round
- `describeEnded()` — surfaces that were still attached learn the session ended, get the end-of-session quiz, don't just go silent

**Permission bug fixed:**  
Starting from the desktop → desktop was the ONE blocked surface because `screenContext` defaults off. Fixed: `start()` grants the permission before checking it.

**Verified live (real 60s wait, no clock manipulation):**
```
Start from desktop → desktop: live, 0 blocked, 4 surfaces in ONE session, 1 active DB row
Cadence: 60s, first check scheduled ahead
After 62s: exactly 1 of 4 simultaneous pulses got the check (not 4 popups)
Answer graded 14/20, mastery moved to 70.0
End from web → desktop, browser, IDE each told endedSession{topic, checkCount}
```

### 4. All three agents on the shared pulse

**Desktop agent (Rust / Tauri):**
- `session::pulse()` replaces 3 separate HTTP calls
- `quiz::show_check()` — native always-on-top window, Cmd+Enter submits, Escape skips
- `quiz::show_end_quiz()` — separate native window with the end-of-session questions
- `quiz::show_wrap_up()` — tells the user why capture stopped (ended elsewhere vs abandoned)
- `SessionManager::claim_wrap_up()` — idempotent; repeated pulses can't reopen the popup

**Browser extension (Chrome MV3):**
- `session.js::pulse()` replaces join/heartbeat; returns `{session, check, endedSession}`
- `background.js::openCheckPopup()` — writes to `chrome.storage.local.pendingQuiz`, opens `quiz-popup.html`
- `quiz-popup.js` — handles both session checks (submit to `/session/check/answer`) and context quizzes (submit to `/context-quiz/submit`); wrap-up shows the session summary + end questions; `correct: null` → "could not be scored" never "0%"

**VS Code extension (TypeScript):**
- `syncSession()` rewritten to `POST /session/pulse`
- `showCheckPanel()` reuses the existing webview, branches on `quiz.kind` for the right submit endpoint
- `reportSessionEnded()` — VS Code information message, shown once per ended session

**Web (Next.js):**
- Session page polls `POST /session/pulse` every 10s
- Recurring checks open as `window.open()` popup (480×600) — separate window, not inline
- End-of-session: popup window opened synchronously in the click handler (before `await`) so the browser's popup blocker can't block it; quiz data written to `sessionStorage` then the popup reloads
- `/dashboard/session/quiz-popup` — standalone page: polls sessionStorage every 200ms (up to 4s) for the quiz data, shows questions, submits, shows score

---

## Key architecture decisions made during the session

| Decision | Why |
|---|---|
| Polling (not WebSockets) for agent sync | Service workers are evicted regularly; Rust agent is `ureq`-only (blocking HTTP). A socket would be torn down constantly. |
| Atomic `UPDATE WHERE nextCheckAt <= NOW()` for check claiming | Prevents all 4 surfaces presenting the same question simultaneously |
| `grantSurfacePermission` only in `start()`, never `join()/pulse()` | A background poll is not consent. Only explicit user action grants access. |
| `window.open()` before `await` in the web End button | Browsers block popups opened after async calls. Must be synchronous in the click handler. |
| `correct: null` on grading failure (not `false`) | Defaulting to `true` on outage told every learner they were right. Defaulting to `false` looks like a real wrong answer. |
| `sessionStorage` + retry loop for popup data | Can't pass complex objects through URL params. The popup may load before the parent finishes the API call. |

---

## Real bugs found (not introduced — pre-existing)

1. **Forgery hole** — `POST /api/graph/update` accepted `mastery: 100` from any authenticated user
2. **Wrong question graded** — interval quiz answer scored against newest question in session, not the one actually asked
3. **Destructive submit** — `assessment.questions = scoredQuestions` wiped the question bank on every submission
4. **Silent 0% on grading failure** — parse error → `totalScore = 0` → mastery drops as if the learner failed
5. **Duplicate session rows** — VS Code auto-called `startSession()` on every window open
6. **WebSocket auth hole** — `RealtimeGateway` accepted `?userId=` with no JWT verification; anyone could read anyone's event stream
7. **Desktop captured before login** — monitor started on `RunEvent::Ready`, before the user authenticated
8. **Heartbeat returned `{status, sessionId}` not `{session}`** — the new session page called `adopt(next)` on it, dropping the session after 15s

---

## Final state

```
pnpm run build          → BUILD_EXIT=0, 22/22 Next.js pages
cargo check             → EXIT=0, 0 warnings
tsc --noEmit (api)      → EXIT=0
tsc --noEmit (web)      → EXIT=0
pnpm --filter edos-vscode run build → EXIT=0
All 6 browser-extension JS files → node --check OK
All 20 web routes       → HTTP 200
E2E assertion suite     → 42/42 PASS
Session + scoring tests → 17/17 PASS
Final behaviour test    → 16/16 PASS (real 60s wait)
```

---

## Files changed (selected highlights)

```
services/api/src/
  modules/scoring/                     ← new: scoring engine
    answer-grader.service.ts           ← deterministic MCQ grading
    mastery.service.ts                 ← evidence-weighted mastery model
    concept-resolver.service.ts        ← fuzzy concept matching
    scoring.constants.ts               ← single source of truth for thresholds
  modules/session/
    session.service.ts                 ← unified session + pulse + grant
    session-check.service.ts           ← server-owned 60s check schedule
    session.controller.ts              ← /session/pulse, /check/answer, /check/skip
  entities/
    learning-session.entity.ts         ← added checkIntervalSeconds, nextCheckAt
    session-participant.entity.ts      ← new

apps/desktop-agent/src-tauri/src/
  session.rs                           ← pulse(), SessionCheck, EndedSession
  quiz.rs                              ← show_check(), show_end_quiz(), show_wrap_up()
  sync.rs                              ← 10s pulse loop

apps/browser-extension/
  session.js                           ← pulse(), answerCheck(), skipCheck()
  background.js                        ← openCheckPopup(), showWrapUp()
  quiz-popup.js                        ← handles session checks + context quizzes + wrap-up

apps/vscode-extension/src/extension.ts
  ← pulse, showCheckPanel(), reportSessionEnded()

apps/web/src/
  app/dashboard/session/page.tsx       ← popup-based checks, end-quiz popup
  app/dashboard/session/quiz-popup/    ← new standalone popup page
  lib/api.ts                           ← SessionCheck, CheckResult, EndedSessionSummary
  components/ui/                       ← full component library
```

---

*Session conducted in Kiro IDE, August 2026.*
