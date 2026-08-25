use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

use crate::auth::AppState;

/// This agent's surface identity in the shared session.
pub const SURFACE: &str = "desktop";

/// A participating surface, as reported by the API.
///
/// The same struct is deserialized from the API and serialized to the window,
/// so the camelCase rename keeps both sides on one spelling.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Participant {
    #[serde(default)]
    pub surface: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, rename = "deviceName")]
    pub device_name: Option<String>,
    #[serde(default, rename = "eventCount")]
    pub event_count: u64,
}

/// A surface that cannot capture because a permission is off.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BlockedSurface {
    #[serde(default)]
    pub surface: String,
    #[serde(default)]
    pub permission: String,
}

/// The learner's shared session, spanning every surface.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionView {
    pub id: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default, rename = "initiatedBy")]
    pub initiated_by: String,
    #[serde(default, rename = "elapsedSeconds")]
    pub elapsed_seconds: u64,
    #[serde(default)]
    pub participants: Vec<Participant>,
    #[serde(default, rename = "blockedSurfaces")]
    pub blocked_surfaces: Vec<BlockedSurface>,
}

impl SessionView {
    /// Is this agent an active participant, and therefore allowed to capture?
    pub fn is_capturing(&self) -> bool {
        self.status == "active"
            && self
                .participants
                .iter()
                .any(|p| p.surface == SURFACE && p.status != "left")
    }

    /// Is this agent blocked by a permission the learner has not granted?
    pub fn blocked_reason(&self) -> Option<String> {
        self.blocked_surfaces
            .iter()
            .find(|b| b.surface == SURFACE)
            .map(|b| b.permission.clone())
    }
}

/// Tracks the shared session this agent is attached to.
///
/// This replaces the old SessionManager, whose `session_id` was written but
/// never read — starting a session on the desktop changed nothing, because the
/// monitor and sync loops did not consult it. Capture is now gated on this
/// state, and the state is refreshed from the API so a session started on any
/// other surface takes effect here too.
#[derive(Default)]
pub struct SessionManager {
    pub session: Mutex<Option<SessionView>>,
    /// The last session we showed a wrap-up for, so it is shown exactly once.
    wrapped_up: Mutex<Option<String>>,
}

impl SessionManager {
    pub fn snapshot(&self) -> Option<SessionView> {
        self.session.lock().unwrap().clone()
    }

    /// Claim the right to show the wrap-up for a session.
    ///
    /// Returns false if it has already been shown, so a repeated pulse cannot
    /// reopen the popup on top of whatever the learner is doing.
    pub fn claim_wrap_up(&self, session_id: &str) -> bool {
        let mut seen = self.wrapped_up.lock().unwrap();
        if seen.as_deref() == Some(session_id) {
            return false;
        }
        *seen = Some(session_id.to_string());
        true
    }

    pub fn set(&self, session: Option<SessionView>) {
        *self.session.lock().unwrap() = session;
    }

    /// Should the monitor be recording right now?
    pub fn is_capturing(&self) -> bool {
        self.session
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| s.is_capturing())
            .unwrap_or(false)
    }

    /// The current session id, for attributing events.
    pub fn session_id(&self) -> Option<String> {
        self.session.lock().unwrap().as_ref().map(|s| s.id.clone())
    }
}

/// A knowledge check the server has assigned to this surface to present.
#[derive(Debug, Clone, Deserialize)]
pub struct SessionCheck {
    pub id: String,
    pub question: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default, rename = "sessionId")]
    pub session_id: String,
    #[serde(default, rename = "nextInSeconds")]
    pub next_in_seconds: u64,
}

/// A session that finished elsewhere, so this agent can say so.
#[derive(Debug, Clone, Deserialize)]
pub struct EndedSession {
    pub id: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default, rename = "elapsedSeconds")]
    pub elapsed_seconds: u64,
    #[serde(default, rename = "checkCount")]
    pub check_count: u64,
    #[serde(default)]
    pub reason: String,
    /// A short end-of-session quiz, if the server could generate one.
    #[serde(default)]
    pub quiz: Option<EndOfSessionQuiz>,
}

/// Questions generated at end-time for the wrap-up popup.
#[derive(Debug, Clone, Deserialize)]
pub struct EndOfSessionQuiz {
    pub id: String,
    #[serde(default)]
    pub questions: Vec<QuizQuestion>,
    #[serde(default)]
    pub topic: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct QuizQuestion {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default, rename = "type")]
    pub qtype: String,
}

/// The whole result of one tick.
#[derive(Deserialize)]
struct PulseResponse {
    #[serde(default)]
    session: Option<SessionView>,
    #[serde(default)]
    check: Option<SessionCheck>,
    #[serde(default, rename = "endedSession")]
    ended_session: Option<EndedSession>,
}

/// What the caller should do after a tick.
pub struct PulseOutcome {
    pub check: Option<SessionCheck>,
    pub ended: Option<EndedSession>,
}

fn bearer(app_state: &'static AppState) -> Option<String> {
    app_state.auth.lock().unwrap().access_token.clone()
}

/// One tick: stay attached to the shared session and collect anything due.
///
/// A single request replaces the previous active -> join -> heartbeat sequence,
/// and returns two things the agent could not previously learn: a knowledge
/// check assigned to this surface, and whether the session was ended elsewhere.
pub fn pulse(app_state: &'static AppState, manager: &'static SessionManager) -> PulseOutcome {
    let idle = PulseOutcome { check: None, ended: None };

    let token = match bearer(app_state) {
        Some(t) => t,
        None => {
            manager.set(None);
            return idle;
        }
    };

    let mut body = serde_json::json!({
        "surface": SURFACE,
        "deviceId": device_id(),
        "deviceName": device_name(),
    });

    // Telling the server which session we think we are in is what lets it say
    // "that one ended" instead of just returning nothing.
    if let Some(known) = manager.session_id() {
        body["knownSessionId"] = serde_json::Value::String(known);
    }

    let url = format!("{}/session/pulse", app_state.api_url);
    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", token))
        .send_string(&body.to_string());

    let parsed = match response {
        Ok(res) => match res.into_json::<PulseResponse>() {
            Ok(p) => p,
            // Keep the last known state rather than flapping capture off and on.
            Err(_) => return idle,
        },
        Err(_) => return idle,
    };

    match parsed.session {
        Some(ref s) if s.status == "active" || s.status == "paused" => {
            manager.set(parsed.session.clone());
        }
        _ => manager.set(None),
    }

    PulseOutcome {
        check: parsed.check,
        ended: parsed.ended_session,
    }
}

/// A stable-ish identifier for this machine, so the devices list is meaningful.
fn device_id() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "desktop-agent".to_string())
}

fn device_name() -> String {
    format!("{} ({})", device_id(), std::env::consts::OS)
}

// ------------------------------------------------------------------ commands

#[tauri::command]
pub fn start_session(
    topic: String,
    state: State<'_, &'static AppState>,
    manager: State<'_, &'static SessionManager>,
) -> Result<SessionStatus, String> {
    let token = bearer(state.inner()).ok_or_else(|| "Not signed in".to_string())?;

    let url = format!("{}/session/start", state.api_url);
    let body = serde_json::json!({
        "topic": if topic.trim().is_empty() { "Desktop session".to_string() } else { topic },
        "surface": SURFACE,
        "deviceId": device_id(),
        "deviceName": device_name(),
    });

    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", token))
        .send_string(&body.to_string())
        .map_err(|e| format!("Could not start session: {}", e))?;

    #[derive(Deserialize)]
    struct StartResponse {
        session: SessionView,
    }

    let parsed: StartResponse = response
        .into_json()
        .map_err(|e| format!("Unexpected response: {}", e))?;

    manager.set(Some(parsed.session.clone()));
    Ok(Some(parsed.session).into())
}

#[tauri::command]
pub fn end_session(
    app_handle: tauri::AppHandle,
    state: State<'_, &'static AppState>,
    manager: State<'_, &'static SessionManager>,
) -> Result<(), String> {
    let token = bearer(state.inner()).ok_or_else(|| "Not signed in".to_string())?;

    let url = format!("{}/session/end", state.api_url);
    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", token))
        .send_string("{}")
        .map_err(|e| format!("Could not end session: {}", e))?;

    manager.set(None);

    // The response now includes a quiz. Show it as a native popup so the
    // user who pressed End gets their questions immediately.
    if let Ok(body) = response.into_json::<serde_json::Value>() {
        if let Some(quiz_val) = body.get("quiz") {
            if let Ok(quiz) = serde_json::from_value::<EndOfSessionQuiz>(quiz_val.clone()) {
                if !quiz.questions.is_empty() {
                    let topic = body.get("session")
                        .and_then(|s| s.get("topic"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("Learning session")
                        .to_string();
                    let elapsed = body.get("session")
                        .and_then(|s| s.get("elapsedSeconds"))
                        .and_then(|e| e.as_u64())
                        .unwrap_or(0);

                    let ended = EndedSession {
                        id: String::new(),
                        topic,
                        elapsed_seconds: elapsed,
                        check_count: 0,
                        reason: "user".to_string(),
                        quiz: Some(quiz),
                    };

                    crate::quiz::show_end_quiz(&app_handle, state.inner(), &ended);
                }
            }
        }
    }

    Ok(())
}

/// What the UI needs to describe the session in one call.
///
/// Every session command returns this one shape so the window never has to
/// branch on which call produced the state.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub active: bool,
    pub capturing: bool,
    pub topic: Option<String>,
    pub mode: Option<String>,
    pub initiated_by: Option<String>,
    pub elapsed_seconds: u64,
    pub surfaces: Vec<Participant>,
    /// The setting the learner must enable before this agent can capture.
    pub blocked_permission: Option<String>,
}

impl From<Option<SessionView>> for SessionStatus {
    fn from(session: Option<SessionView>) -> Self {
        match session {
            Some(s) => SessionStatus {
                active: s.status == "active" || s.status == "paused",
                capturing: s.is_capturing() && s.status == "active",
                topic: Some(s.topic.clone()),
                mode: Some(s.mode.clone()),
                initiated_by: Some(s.initiated_by.clone()),
                elapsed_seconds: s.elapsed_seconds,
                blocked_permission: s.blocked_reason(),
                surfaces: s.participants,
            },
            None => SessionStatus {
                active: false,
                capturing: false,
                topic: None,
                mode: None,
                initiated_by: None,
                elapsed_seconds: 0,
                surfaces: vec![],
                blocked_permission: None,
            },
        }
    }
}

#[tauri::command]
pub fn get_session(manager: State<'_, &'static SessionManager>) -> Result<SessionStatus, String> {
    Ok(manager.snapshot().into())
}
