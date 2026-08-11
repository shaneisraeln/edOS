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

        // Build quiz HTML and write to temp file
        let quiz_html = build_quiz_html(&quiz_id, &topic, &questions, &app_state.api_url, &token);
        let temp_dir = std::env::temp_dir();
        let quiz_path = temp_dir.join("edos_quiz.html");
        if std::fs::write(&quiz_path, quiz_html).is_err() {
            return;
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
    let questions_html: String = questions.iter().enumerate().map(|(i, q)| {
        let text = q["text"].as_str().unwrap_or("Question");
        let fallback_id = format!("q{}", i + 1);
        let id = q["id"].as_str().unwrap_or(&fallback_id);
        format!(r#"<div class="question"><div class="qnum">Question {num}</div><div class="qtext">{text}</div><textarea id="a-{id}" placeholder="Your answer..."></textarea></div>"#,
            num = i + 1, text = html_escape(text), id = id)
    }).collect();

    let question_ids: Vec<String> = questions.iter().enumerate().map(|(i, q)| {
        q["id"].as_str().unwrap_or(&format!("q{}", i + 1)).to_string()
    }).collect();

    format!(r#"<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quick Check</title>
<style>*{{margin:0;padding:0;box-sizing:border-box}}body{{font-family:-apple-system,sans-serif;padding:20px;background:#fafafa;color:#1a1b1e}}h1{{font-size:16px;color:#4c6ef5;margin-bottom:4px}}.topic{{font-size:12px;color:#868e96;margin-bottom:16px}}.question{{background:white;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}}.qnum{{font-size:10px;font-weight:600;color:#4c6ef5;text-transform:uppercase;margin-bottom:4px}}.qtext{{font-size:13px;line-height:1.5;margin-bottom:8px}}textarea{{width:100%;padding:8px;border:1px solid #dee2e6;border-radius:6px;font-size:12px;min-height:60px;font-family:inherit;resize:vertical}}textarea:focus{{outline:none;border-color:#4c6ef5}}.actions{{display:flex;gap:8px;margin-top:14px}}button{{flex:1;padding:10px;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer}}.btn-p{{background:#4c6ef5;color:white}}.btn-s{{background:#f1f3f5;color:#495057}}#result{{display:none;text-align:center;padding:20px}}#result .score{{font-size:42px;font-weight:700;color:#4c6ef5}}#result .fb{{font-size:12px;color:#495057;margin-top:8px}}#status{{font-size:11px;color:#868e96;margin-top:8px;text-align:center}}</style></head><body>
<div id="quizView"><h1>Quick Knowledge Check</h1><div class="topic">{topic}</div>{questions_html}
<div class="actions"><button class="btn-s" onclick="skipQuiz()">Skip</button><button class="btn-p" onclick="submitQuiz()">Submit</button></div>
<div id="status"></div></div>
<div id="result"><div class="score" id="scoreVal">--</div><div class="fb" id="fbVal"></div><button class="btn-p" style="margin-top:16px;width:auto;flex:none;padding:10px 24px" onclick="window.close()">Done</button></div>
<script>
var API="{api_url}";var TOKEN="{token}";var QUIZ_ID="{quiz_id}";var QS={q_ids};
function submitQuiz(){{document.getElementById("status").textContent="Scoring...";var answers=QS.map(function(id){{return{{questionId:id,answer:(document.getElementById("a-"+id)||{{}}).value||""}}}});fetch(API+"/context-quiz/submit",{{method:"POST",headers:{{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN}},body:JSON.stringify({{quizId:QUIZ_ID,answers:answers}})}}).then(function(r){{return r.json()}}).then(function(d){{document.getElementById("quizView").style.display="none";document.getElementById("result").style.display="block";document.getElementById("scoreVal").textContent=(d.percentage||0)+"%";document.getElementById("fbVal").textContent=d.feedback||"Done!"}}).catch(function(e){{document.getElementById("status").textContent="Error: "+e.message}})}}
function skipQuiz(){{fetch(API+"/context-quiz/skip",{{method:"POST",headers:{{"Content-Type":"application/json","Authorization":"Bearer "+TOKEN}},body:JSON.stringify({{quizId:QUIZ_ID}})}}).catch(function(){{}});window.close()}}
</script></body></html>"#,
        topic = html_escape(topic),
        questions_html = questions_html,
        api_url = api_url,
        token = token,
        quiz_id = quiz_id,
        q_ids = serde_json::to_string(&question_ids).unwrap_or("[]".to_string()),
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
