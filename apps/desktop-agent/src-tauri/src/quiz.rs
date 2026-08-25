use std::thread;
use tauri::{AppHandle, Manager, WindowBuilder, WindowUrl};

use crate::auth::AppState;
use crate::session::SessionCheck;

/// Shared styling for every popup this agent opens.
///
/// Extracted so the knowledge check, the context quiz and the wrap-up prompt
/// look like one product instead of three. Braces are doubled because these
/// strings are consumed by `format!`.
const POPUP_STYLE: &str = r#"
:root {
  --bg:#fbfbfc; --surface:#fff; --text:#111113; --muted:#71717a;
  --border:#e7e7ea; --accent:#3564d4; --accent-soft:#eef2fd;
  --danger:#b42318; --ok:#16a34a; --warn:#d97706;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#0f0f11; --surface:#17171a; --text:#f4f4f5; --muted:#8e8e98;
    --border:#26262b; --accent:#7c9cf0; --accent-soft:#1a2136;
    --danger:#f97066; --ok:#4ade80; --warn:#fbbf24; }
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);font-size:13px;line-height:1.5;background:var(--bg);color:var(--text);padding:22px 20px 24px;-webkit-font-smoothing:antialiased}
.eyebrow{font-size:11px;color:var(--muted);margin-bottom:2px}
h1{font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3;margin-bottom:18px}
.question{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px}
.question+.question{margin-top:14px}
.qnum{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;margin-bottom:6px}
.qtext{font-size:13px;line-height:1.5;margin-bottom:10px}
textarea{width:100%;min-height:74px;padding:9px 11px;font-family:inherit;font-size:13px;line-height:1.5;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;resize:vertical;transition:border-color .12s,box-shadow .12s}
textarea::placeholder{color:var(--muted)}
textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.actions{display:flex;gap:8px;margin-top:18px}
button{flex:1;padding:10px 14px;font-family:inherit;font-size:13px;font-weight:500;border:1px solid transparent;border-radius:8px;cursor:pointer;transition:opacity .12s,background .12s}
.btn-solid{background:var(--text);color:var(--bg)}
.btn-solid:hover:not(:disabled){opacity:.86}
.btn-solid:disabled{opacity:.32;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--muted);border-color:var(--border)}
.btn-ghost:hover{color:var(--text);background:var(--surface)}
#status{display:none;margin-top:12px;padding:9px 11px;font-size:12px;color:var(--danger);background:var(--surface);border:1px solid var(--border);border-radius:8px}
#status.visible{display:block}
#result{display:none;text-align:center;padding:44px 8px}
#result .score{font-size:44px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1;margin:6px 0 10px}
#result .fb{font-size:13px;color:var(--muted);line-height:1.55;max-width:34ch;margin:0 auto 22px}
#result button{flex:none;min-width:116px}
.verdict{font-size:15px;font-weight:600;margin-bottom:8px}
.verdict.ok{color:var(--ok)}
.verdict.no{color:var(--warn)}
.summary{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:4px}
.row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;font-size:13px}
.row+.row{border-top:1px solid var(--border)}
.row .k{color:var(--muted)}
.row .v{font-weight:500;font-variant-numeric:tabular-nums}
.note{font-size:11px;color:var(--muted);line-height:1.5;margin-top:12px}
"#;

/// Write a popup document to a private temp file and open it in a native window.
///
/// Every popup goes through here so window handling and the 0600 permission are
/// not reimplemented per popup type.
fn open_popup(
    handle: &AppHandle,
    label: &'static str,
    file_stem: &str,
    window_title: &str,
    html: String,
    size: (f64, f64),
) {
    let path = std::env::temp_dir().join(format!("{}.html", file_stem));
    if std::fs::write(&path, html).is_err() {
        return;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }

    let file_url = format!("file:///{}", path.to_string_lossy().replace('\\', "/"));
    let handle_for_closure = handle.clone();
    let title_owned = window_title.to_string();

    let _ = handle.run_on_main_thread(move || {
        if let Some(existing) = handle_for_closure.get_window(label) {
            let _ = existing.close();
        }

        let parsed = match url::Url::parse(&file_url) {
            Ok(u) => u,
            Err(_) => return,
        };

        let _ = WindowBuilder::new(&handle_for_closure, label, WindowUrl::External(parsed))
            .title(title_owned)
            .inner_size(size.0, size.1)
            .resizable(true)
            .always_on_top(true)
            .focused(true)
            .build();
    });
}

/// Show the recurring "are you still learning?" check.
///
/// The question is chosen and scheduled by the server, so the learner is asked
/// once per interval across every surface rather than once per surface.
pub fn show_check(app_handle: &AppHandle, app_state: &'static AppState, check: &SessionCheck) {
    let token = {
        let auth = app_state.auth.lock().unwrap();
        match &auth.access_token {
            Some(t) => t.clone(),
            None => return,
        }
    };

    let html = build_check_html(check, &app_state.api_url, &token);
    open_popup(
        app_handle,
        "check",
        "edos_check",
        "Knowledge check — edOS",
        html,
        (440.0, 470.0),
    );
}

/// Tell the learner a session they were part of has ended somewhere else.
///
/// Without this the agent simply stopped capturing, so ending a session on the
/// laptop left the desktop agent looking like it had silently died.
pub fn show_wrap_up(
    app_handle: &AppHandle,
    topic: &str,
    elapsed_seconds: u64,
    checks_answered: u64,
    reason: &str,
) {
    let html = build_wrap_up_html(topic, elapsed_seconds, checks_answered, reason);
    open_popup(
        app_handle,
        "wrapup",
        "edos_wrapup",
        "Session ended — edOS",
        html,
        (400.0, 420.0),
    );
}

fn build_check_html(check: &SessionCheck, api_url: &str, token: &str) -> String {
    let js_json = |v: &str| serde_json::to_string(v).unwrap_or_else(|_| "\"\"".to_string());

    format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Knowledge check</title>
<style>{style}</style></head><body>
<main id="quizView">
  <p class="eyebrow">Knowledge check</p>
  <h1>{topic}</h1>
  <div class="question">
    <p class="qtext">{question}</p>
    <textarea id="answer" placeholder="Answer in a sentence or two" aria-label="Your answer" autofocus></textarea>
  </div>
  <div class="actions">
    <button type="button" class="btn-ghost" id="skipBtn">Skip</button>
    <button type="button" class="btn-solid" id="submitBtn">Submit</button>
  </div>
  <p class="note">Checks like this run every {every} seconds while a session is active.</p>
  <p id="status" role="alert"></p>
</main>
<section id="result">
  <p class="verdict" id="verdict"></p>
  <p class="score" id="scoreVal">—</p>
  <p class="fb" id="fbVal"></p>
  <button type="button" class="btn-solid" id="doneBtn">Done</button>
</section>
<script>
var API = {api_url};
var TOKEN = {token};
var CHECK_ID = {check_id};
var SESSION_ID = {session_id};
var submitted = false;

function headers() {{
  return {{ "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN }};
}}

function showStatus(msg) {{
  var s = document.getElementById("status");
  s.textContent = msg;
  s.classList.add("visible");
}}

function submitCheck() {{
  if (submitted) return;
  var answer = document.getElementById("answer").value.trim();
  if (!answer) {{ showStatus("Write an answer, or skip."); return; }}

  submitted = true;
  var btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Scoring";

  fetch(API + "/session/check/answer", {{
    method: "POST",
    headers: headers(),
    body: JSON.stringify({{ checkId: CHECK_ID, answer: answer, sessionId: SESSION_ID }})
  }})
    .then(function (r) {{
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }})
    .then(function (d) {{
      document.getElementById("quizView").style.display = "none";
      document.getElementById("result").style.display = "block";

      var v = document.getElementById("verdict");
      // correct is null when grading was unavailable. Saying "incorrect" there
      // would be a lie, so it gets its own wording.
      if (d.correct === true) {{ v.textContent = "That holds up"; v.className = "verdict ok"; }}
      else if (d.correct === false) {{ v.textContent = "Not quite"; v.className = "verdict no"; }}
      else {{ v.textContent = "Not scored"; v.className = "verdict"; }}

      var score = document.getElementById("scoreVal");
      score.textContent = (d.score === null || d.score === undefined)
        ? "—" : d.score + " / " + d.maxScore;

      document.getElementById("fbVal").textContent =
        d.correct === null
          ? "This one could not be scored, so nothing was recorded."
          : (d.feedback || "Recorded.");
    }})
    .catch(function (e) {{
      submitted = false;
      btn.disabled = false;
      btn.textContent = "Submit";
      showStatus("Could not submit: " + e.message);
    }});
}}

function skipCheck() {{
  fetch(API + "/session/check/skip", {{
    method: "POST",
    headers: headers(),
    body: JSON.stringify({{ checkId: CHECK_ID, sessionId: SESSION_ID }})
  }}).catch(function () {{}});
  window.close();
}}

document.getElementById("submitBtn").addEventListener("click", submitCheck);
document.getElementById("skipBtn").addEventListener("click", skipCheck);
document.getElementById("doneBtn").addEventListener("click", function () {{ window.close(); }});
// Cmd/Ctrl+Enter submits, so the popup can be cleared without reaching for the mouse.
document.addEventListener("keydown", function (e) {{
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitCheck();
  if (e.key === "Escape") skipCheck();
}});
</script></body></html>"#,
        style = POPUP_STYLE,
        topic = html_escape(&check.topic),
        question = html_escape(&check.question),
        every = check.next_in_seconds,
        api_url = js_json(api_url),
        token = js_json(token),
        check_id = js_json(&check.id),
        session_id = js_json(&check.session_id),
    )
}

fn build_wrap_up_html(
    topic: &str,
    elapsed_seconds: u64,
    checks_answered: u64,
    reason: &str,
) -> String {
    let hours = elapsed_seconds / 3600;
    let minutes = (elapsed_seconds % 3600) / 60;
    let seconds = elapsed_seconds % 60;
    let duration = if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{}s", seconds)
    };

    let explanation = if reason == "abandoned" {
        "No surface reported in for a while, so the session was closed automatically."
    } else {
        "The session was ended from another device, so this agent has stopped capturing."
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Session ended</title>
<style>{style}</style></head><body>
<p class="eyebrow">Session ended</p>
<h1>{topic}</h1>
<div class="summary">
  <div class="row"><span class="k">Time</span><span class="v">{duration}</span></div>
  <div class="row"><span class="k">Checks answered</span><span class="v">{checks}</span></div>
</div>
<p class="note">{explanation}</p>
<div class="actions">
  <button type="button" class="btn-solid" id="doneBtn">Done</button>
</div>
<script>
document.getElementById("doneBtn").addEventListener("click", function () {{ window.close(); }});
document.addEventListener("keydown", function (e) {{
  if (e.key === "Escape" || e.key === "Enter") window.close();
}});
</script></body></html>"#,
        style = POPUP_STYLE,
        topic = html_escape(topic),
        duration = duration,
        checks = checks_answered,
        explanation = explanation,
    )
}

/// Trigger a context quiz after the user spent time on educational content.
pub fn trigger_quiz(app_handle: &AppHandle, app_state: &'static AppState, title: &str, duration_secs: u64) {
    let handle = app_handle.clone();
    let title_owned = title.to_string();

    thread::spawn(move || {
        let token = {
            let auth = app_state.auth.lock().unwrap();
            match &auth.access_token {
                Some(t) => t.clone(),
                None => return,
            }
        };

        let url = format!("{}/context-quiz/generate", app_state.api_url);
        let body = serde_json::json!({
            "context": format!("The user was focused on: \"{}\" for {} minutes.", title_owned, duration_secs / 60),
            "source": "desktop",
            "title": title_owned,
            "timeSpent": duration_secs,
            "topics": []
        });

        let response = match ureq::post(&url)
            .set("Content-Type", "application/json")
            .set("Authorization", &format!("Bearer {}", token))
            .send_string(&body.to_string())
        {
            Ok(r) => r,
            Err(_) => return,
        };

        let text = match response.into_string() {
            Ok(t) => t,
            Err(_) => return,
        };

        let data: serde_json::Value = match serde_json::from_str(&text) {
            Ok(d) => d,
            Err(_) => return,
        };

        if data.get("skipped").and_then(|v| v.as_bool()).unwrap_or(false) {
            return;
        }

        let questions = match data.get("questions").and_then(|q| q.as_array()) {
            Some(q) if !q.is_empty() => q.clone(),
            _ => return,
        };

        let quiz_id = data["id"].as_str().unwrap_or("").to_string();
        let topic = data["topic"].as_str().unwrap_or(&title_owned).to_string();

        // Build quiz HTML and write to a temp file.
        //
        // SECURITY: this file contains the user's bearer token, because the
        // popup is loaded from a file:// URL and therefore has no access to
        // Tauri IPC or app storage. The file is written owner-only (0600 on
        // Unix) to limit exposure on shared machines. Moving the popup to a
        // bundled Tauri asset window and submitting through a #[tauri::command]
        // would remove the need to embed the token at all.
        let quiz_html = build_quiz_html(&quiz_id, &topic, &questions, &app_state.api_url, &token);
        let temp_dir = std::env::temp_dir();
        let quiz_path = temp_dir.join("edos_quiz.html");
        if std::fs::write(&quiz_path, quiz_html).is_err() {
            return;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&quiz_path, std::fs::Permissions::from_mode(0o600));
        }

        let file_url = format!("file:///{}", quiz_path.to_string_lossy().replace('\\', "/"));

        // Open popup on main thread
        let handle_for_closure = handle.clone();        let _ = handle.run_on_main_thread(move || {
            if let Some(existing) = handle_for_closure.get_window("quiz") {
                let _ = existing.close();
            }

            let parsed_url = match url::Url::parse(&file_url) {
                Ok(u) => u,
                Err(_) => return,
            };

            let _ = WindowBuilder::new(&handle_for_closure, "quiz", WindowUrl::External(parsed_url))
                .title("Quick Knowledge Check — edOS")
                .inner_size(460.0, 550.0)
                .resizable(true)
                .always_on_top(true)
                .focused(true)
                .build();
        });
    });
}

fn build_quiz_html(quiz_id: &str, topic: &str, questions: &[serde_json::Value], api_url: &str, token: &str) -> String {
    let total = questions.len();

    let questions_html: String = questions
        .iter()
        .enumerate()
        .map(|(i, q)| {
            let text = q["text"].as_str().unwrap_or("Question");
            let fallback_id = format!("q{}", i + 1);
            let id = q["id"].as_str().unwrap_or(&fallback_id);
            format!(
                r#"<div class="question"><p class="qnum">{num} of {total}</p><p class="qtext">{text}</p><textarea id="a-{id}" placeholder="Your answer" aria-label="Answer to question {num}"></textarea></div>"#,
                num = i + 1,
                total = total,
                text = html_escape(text),
                id = html_escape(id)
            )
        })
        .collect();

    let question_ids: Vec<String> = questions
        .iter()
        .enumerate()
        .map(|(i, q)| {
            q["id"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("q{}", i + 1))
        })
        .collect();

    // Embed values as JSON literals so quotes/backslashes can't break out of
    // the surrounding script and can't be injected into it.
    let js_json = |v: &str| serde_json::to_string(v).unwrap_or_else(|_| "\"\"".to_string());

    format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quick check</title>
<style>
:root {{
  --bg:#fbfbfc; --surface:#fff; --text:#111113; --muted:#71717a;
  --border:#e7e7ea; --accent:#3564d4; --accent-soft:#eef2fd; --danger:#b42318;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}}
@media (prefers-color-scheme: dark) {{
  :root {{ --bg:#0f0f11; --surface:#17171a; --text:#f4f4f5; --muted:#8e8e98;
    --border:#26262b; --accent:#7c9cf0; --accent-soft:#1a2136; --danger:#f97066; }}
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:var(--font);font-size:13px;line-height:1.5;background:var(--bg);color:var(--text);padding:22px 20px 24px;-webkit-font-smoothing:antialiased}}
.eyebrow{{font-size:11px;color:var(--muted);margin-bottom:2px}}
h1{{font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3;margin-bottom:18px}}
.question{{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px}}
.question+.question{{margin-top:14px}}
.qnum{{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;margin-bottom:6px}}
.qtext{{font-size:13px;line-height:1.5;margin-bottom:10px}}
textarea{{width:100%;min-height:74px;padding:9px 11px;font-family:inherit;font-size:13px;line-height:1.5;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;resize:vertical;transition:border-color .12s,box-shadow .12s}}
textarea::placeholder{{color:var(--muted)}}
textarea:focus{{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}}
.actions{{display:flex;gap:8px;margin-top:18px}}
button{{flex:1;padding:10px 14px;font-family:inherit;font-size:13px;font-weight:500;border:1px solid transparent;border-radius:8px;cursor:pointer;transition:opacity .12s,background .12s}}
.btn-solid{{background:var(--text);color:var(--bg)}}
.btn-solid:hover:not(:disabled){{opacity:.86}}
.btn-solid:disabled{{opacity:.32;cursor:not-allowed}}
.btn-ghost{{background:transparent;color:var(--muted);border-color:var(--border)}}
.btn-ghost:hover{{color:var(--text);background:var(--surface)}}
#status{{display:none;margin-top:12px;padding:9px 11px;font-size:12px;color:var(--danger);background:var(--surface);border:1px solid var(--border);border-radius:8px}}
#status.visible{{display:block}}
#result{{display:none;text-align:center;padding:44px 8px}}
#result .score{{font-size:44px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1;margin:6px 0 10px}}
#result .fb{{font-size:13px;color:var(--muted);line-height:1.55;max-width:34ch;margin:0 auto 22px}}
#result button{{flex:none;min-width:116px}}
</style></head><body>
<main id="quizView">
  <p class="eyebrow">Quick check</p>
  <h1>{topic}</h1>
  {questions_html}
  <div class="actions">
    <button type="button" class="btn-ghost" id="skipBtn">Skip</button>
    <button type="button" class="btn-solid" id="submitBtn">Submit</button>
  </div>
  <p id="status" role="alert"></p>
</main>
<section id="result">
  <p class="eyebrow">Your score</p>
  <p class="score" id="scoreVal">—</p>
  <p class="fb" id="fbVal"></p>
  <button type="button" class="btn-solid" id="doneBtn">Done</button>
</section>
<script>
var API = {api_url};
var TOKEN = {token};
var QUIZ_ID = {quiz_id};
var QS = {q_ids};
var submitted = false;

function headers() {{
  return {{ "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN }};
}}

function showStatus(msg) {{
  var s = document.getElementById("status");
  s.textContent = msg;
  s.classList.add("visible");
}}

function submitQuiz() {{
  if (submitted) return;
  submitted = true;

  var btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Scoring";

  var answers = QS.map(function (id) {{
    var field = document.getElementById("a-" + id);
    return {{ questionId: id, answer: field ? field.value.trim() : "" }};
  }});

  fetch(API + "/context-quiz/submit", {{
    method: "POST",
    headers: headers(),
    body: JSON.stringify({{ quizId: QUIZ_ID, answers: answers }})
  }})
    .then(function (r) {{
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }})
    .then(function (d) {{
      document.getElementById("quizView").style.display = "none";
      document.getElementById("result").style.display = "block";
      document.getElementById("scoreVal").textContent = Math.round(d.percentage || 0) + "%";
      document.getElementById("fbVal").textContent = d.feedback || "Answers recorded.";
    }})
    .catch(function (e) {{
      submitted = false;
      btn.disabled = false;
      btn.textContent = "Submit";
      showStatus("Could not submit: " + e.message);
    }});
}}

function skipQuiz() {{
  fetch(API + "/context-quiz/skip", {{
    method: "POST",
    headers: headers(),
    body: JSON.stringify({{ quizId: QUIZ_ID }})
  }}).catch(function () {{}});
  window.close();
}}

document.getElementById("submitBtn").addEventListener("click", submitQuiz);
document.getElementById("skipBtn").addEventListener("click", skipQuiz);
document.getElementById("doneBtn").addEventListener("click", function () {{ window.close(); }});
</script></body></html>"#,
        topic = html_escape(topic),
        questions_html = questions_html,
        api_url = js_json(api_url),
        token = js_json(token),
        quiz_id = js_json(quiz_id),
        q_ids = serde_json::to_string(&question_ids).unwrap_or_else(|_| "[]".to_string()),
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

use crate::session::EndedSession;

/// Show a real end-of-session quiz (questions to answer, not just a summary).
///
/// This is the popup the user expects when they stop a session: "prove you
/// actually learned something." The questions are generated server-side and
/// graded via the same /session/check/answer endpoint as the recurring checks.
pub fn show_end_quiz(app_handle: &AppHandle, app_state: &'static AppState, ended: &EndedSession) {
    let token = {
        let auth = app_state.auth.lock().unwrap();
        match &auth.access_token {
            Some(t) => t.clone(),
            None => return,
        }
    };

    let quiz = match &ended.quiz {
        Some(q) if !q.questions.is_empty() => q,
        _ => return,
    };

    let html = build_end_quiz_html(quiz, &ended.topic, ended.elapsed_seconds, &app_state.api_url, &token);
    open_popup(
        app_handle,
        "wrapup",
        "edos_end_quiz",
        "Session ended — quick check",
        html,
        (460.0, 580.0),
    );
}

fn build_end_quiz_html(
    quiz: &crate::session::EndOfSessionQuiz,
    topic: &str,
    elapsed_seconds: u64,
    api_url: &str,
    token: &str,
) -> String {
    let js_json = |v: &str| serde_json::to_string(v).unwrap_or_else(|_| "\"\"".to_string());

    let total = quiz.questions.len();
    let questions_html: String = quiz
        .questions
        .iter()
        .enumerate()
        .map(|(i, q)| {
            format!(
                r#"<div class="question"><p class="qnum">{num} of {total}</p><p class="qtext">{text}</p><textarea id="a-{id}" placeholder="Your answer" aria-label="Answer to question {num}"></textarea></div>"#,
                num = i + 1,
                total = total,
                text = html_escape(&q.text),
                id = html_escape(&q.id),
            )
        })
        .collect();

    let q_ids: Vec<String> = quiz.questions.iter().map(|q| q.id.clone()).collect();

    let minutes = elapsed_seconds / 60;

    format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Session ended — quick check</title>
<style>{style}</style></head><body>
<main id="quizView">
  <p class="eyebrow">Session ended · {minutes}m studied</p>
  <h1>{topic}</h1>
  <p class="note" style="margin-bottom:16px">Answer these before you move on — it takes 30 seconds and cements what you learned.</p>
  {questions_html}
  <div class="actions">
    <button type="button" class="btn-ghost" id="skipBtn">Skip</button>
    <button type="button" class="btn-solid" id="submitBtn">Submit</button>
  </div>
  <p id="status" role="alert"></p>
</main>
<section id="result">
  <p class="verdict" id="verdict"></p>
  <p class="score" id="scoreVal">—</p>
  <p class="fb" id="fbVal"></p>
  <button type="button" class="btn-solid" id="doneBtn">Done</button>
</section>
<script>
var API = {api_url};
var TOKEN = {token};
var QS = {q_ids};
var submitted = false;

function headers() {{
  return {{ "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN }};
}}

function showStatus(msg) {{
  var s = document.getElementById("status");
  s.textContent = msg;
  s.classList.add("visible");
}}

function submitQuiz() {{
  if (submitted) return;
  // At least one answer required.
  var answered = QS.some(function (id) {{
    var f = document.getElementById("a-" + id);
    return f && f.value.trim().length > 0;
  }});
  if (!answered) {{ showStatus("Write at least one answer, or skip."); return; }}

  submitted = true;
  var btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Scoring";

  // Submit each question as its own check/answer. They were generated as
  // individual interval_quiz_shown events server-side, so each has its own id.
  var promises = QS.map(function (id) {{
    var f = document.getElementById("a-" + id);
    var answer = f ? f.value.trim() : "";
    if (!answer) return Promise.resolve(null);
    return fetch(API + "/session/check/answer", {{
      method: "POST",
      headers: headers(),
      body: JSON.stringify({{ checkId: id, answer: answer }})
    }}).then(function (r) {{ return r.ok ? r.json() : null; }}).catch(function () {{ return null; }});
  }});

  Promise.all(promises).then(function (results) {{
    var graded = results.filter(function (r) {{ return r && typeof r.score === "number"; }});
    document.getElementById("quizView").style.display = "none";
    document.getElementById("result").style.display = "block";

    if (graded.length === 0) {{
      document.getElementById("verdict").textContent = "Not scored";
      document.getElementById("scoreVal").textContent = "—";
      document.getElementById("fbVal").textContent = "Answers recorded but could not be graded.";
      return;
    }}

    var totalScore = graded.reduce(function (s, r) {{ return s + r.score; }}, 0);
    var totalMax = graded.reduce(function (s, r) {{ return s + r.maxScore; }}, 0);
    var allCorrect = graded.every(function (r) {{ return r.correct === true; }});
    var anyCorrect = graded.some(function (r) {{ return r.correct === true; }});

    var v = document.getElementById("verdict");
    if (allCorrect) {{ v.textContent = "Solid retention"; v.className = "verdict ok"; }}
    else if (anyCorrect) {{ v.textContent = "Partially there"; v.className = "verdict no"; }}
    else {{ v.textContent = "Needs review"; v.className = "verdict no"; }}

    document.getElementById("scoreVal").textContent = totalScore + " / " + totalMax;
    document.getElementById("fbVal").textContent = graded.map(function (r) {{ return r.feedback || ""; }}).filter(Boolean).join(" ") || "Answers recorded.";
  }}).catch(function (e) {{
    submitted = false;
    btn.disabled = false;
    btn.textContent = "Submit";
    showStatus("Could not submit: " + e.message);
  }});
}}

function skipAll() {{
  QS.forEach(function (id) {{
    fetch(API + "/session/check/skip", {{
      method: "POST",
      headers: headers(),
      body: JSON.stringify({{ checkId: id }})
    }}).catch(function () {{}});
  }});
  window.close();
}}

document.getElementById("submitBtn").addEventListener("click", submitQuiz);
document.getElementById("skipBtn").addEventListener("click", skipAll);
document.getElementById("doneBtn").addEventListener("click", function () {{ window.close(); }});
document.addEventListener("keydown", function (e) {{
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitQuiz();
  if (e.key === "Escape") skipAll();
}});
</script></body></html>"#,
        style = POPUP_STYLE,
        topic = html_escape(topic),
        minutes = minutes,
        questions_html = questions_html,
        api_url = js_json(api_url),
        token = js_json(token),
        q_ids = serde_json::to_string(&q_ids).unwrap_or_else(|_| "[]".to_string()),
    )
}
