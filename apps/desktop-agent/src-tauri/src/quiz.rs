use std::thread;
use tauri::{AppHandle, Manager, WindowBuilder, WindowUrl};

use crate::auth::AppState;

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
