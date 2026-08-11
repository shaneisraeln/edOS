use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthState {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
}

pub struct AppState {
    pub auth: Mutex<AuthState>,
    pub api_url: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            auth: Mutex::new(AuthState::default()),
            api_url: "http://localhost:3001/api".to_string(),
        }
    }
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub logged_in: bool,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub monitoring: bool,
}

#[tauri::command]
pub fn login(
    email: String,
    password: String,
    state: State<'_, &'static AppState>,
) -> Result<String, String> {
    let url = format!("{}/auth/login", state.api_url);
    let body = serde_json::json!({ "email": email, "password": password }).to_string();

    let response = match ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_string(&body)
    {
        Ok(resp) => resp,
        Err(ureq::Error::Status(code, resp)) => {
            // HTTP error (401, 403, etc.)
            let body = resp.into_string().unwrap_or_default();
            return Err(format!("Login failed ({}): {}", code, body));
        }
        Err(ureq::Error::Transport(e)) => {
            return Err(format!("Cannot connect to API: {}. Is the server running at {}?", e, state.api_url));
        }
    };

    let text = response.into_string().map_err(|e| format!("Read error: {}", e))?;
    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Parse error: {}", e))?;

    let mut auth = state.auth.lock().unwrap();
    auth.access_token = data["accessToken"].as_str().map(|s| s.to_string());
    auth.refresh_token = data["refreshToken"].as_str().map(|s| s.to_string());
    auth.user_name = data["user"]["name"].as_str().map(|s| s.to_string());
    auth.user_email = data["user"]["email"].as_str().map(|s| s.to_string());

    if auth.access_token.is_none() {
        return Err("Login succeeded but no token received".to_string());
    }

    Ok(auth.user_name.clone().unwrap_or_default())
}

#[tauri::command]
pub fn logout(state: State<'_, &'static AppState>) -> Result<(), String> {
    let mut auth = state.auth.lock().unwrap();
    *auth = AuthState::default();
    Ok(())
}

#[tauri::command]
pub fn get_status(
    state: State<'_, &'static AppState>,
    monitor: State<'_, &'static crate::monitor::MonitorState>,
) -> Result<StatusResponse, String> {
    let auth = state.auth.lock().unwrap();
    let is_monitoring = *monitor.is_monitoring.lock().unwrap();
    Ok(StatusResponse {
        logged_in: auth.access_token.is_some(),
        user_name: auth.user_name.clone(),
        user_email: auth.user_email.clone(),
        monitoring: is_monitoring,
    })
}
