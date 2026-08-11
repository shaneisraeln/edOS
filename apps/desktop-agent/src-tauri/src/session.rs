use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

use crate::auth::AppState;

#[derive(Debug, Clone, Serialize, Default)]
pub struct SessionState {
    pub session_id: Option<String>,
    pub topic: Option<String>,
    pub active: bool,
}

pub struct SessionManager {
    pub state: Mutex<SessionState>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self {
            state: Mutex::new(SessionState::default()),
        }
    }
}

#[tauri::command]
pub fn start_session(
    topic: String,
    app_state: State<'_, &'static AppState>,
    session_mgr: State<'_, SessionManager>,
) -> Result<String, String> {
    let token = {
        let auth = app_state.auth.lock().unwrap();
        auth.access_token.clone().ok_or("Not logged in".to_string())?
    };

    let url = format!("{}/learning/start", app_state.api_url);
    let body = serde_json::json!({ "topic": topic });

    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", token))
        .send_string(&body.to_string())
        .map_err(|e| format!("Request failed: {}", e))?;

    let data: serde_json::Value = response.into_json().map_err(|e| e.to_string())?;
    let session_id = data["id"].as_str().unwrap_or("").to_string();

    let mut session = session_mgr.state.lock().unwrap();
    session.session_id = Some(session_id.clone());
    session.topic = Some(topic);
    session.active = true;

    Ok(session_id)
}

#[tauri::command]
pub fn end_session(
    app_state: State<'_, &'static AppState>,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    let token = {
        let auth = app_state.auth.lock().unwrap();
        auth.access_token.clone().ok_or("Not logged in".to_string())?
    };

    let session_id = {
        let session = session_mgr.state.lock().unwrap();
        session.session_id.clone().ok_or("No active session".to_string())?
    };

    let url = format!("{}/learning/end", app_state.api_url);
    let body = serde_json::json!({ "sessionId": session_id });

    let _ = ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", token))
        .send_string(&body.to_string());

    let mut session = session_mgr.state.lock().unwrap();
    session.active = false;
    session.session_id = None;
    session.topic = None;

    Ok(())
}
