use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};

use crate::auth::AppState;
use crate::events::{EventQueue, LearningEvent};
use crate::quiz;
use crate::session::SessionManager;

#[derive(Debug, Clone, Default)]
pub struct WindowInfo {
    pub title: String,
    pub process_name: String,
    pub is_educational: bool,
    pub seconds: u64,
}

pub struct MonitorState {
    pub current_window: Mutex<WindowInfo>,
    pub is_monitoring: Mutex<bool>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            current_window: Mutex::new(WindowInfo::default()),
            is_monitoring: Mutex::new(true),
        }
    }
}

const EDUCATIONAL_KEYWORDS: &[&str] = &[
    "documentation", "docs", "tutorial", "guide", "learn",
    "stack overflow", "github", "stackoverflow",
    "mdn web docs", "api reference", "reference",
    "chatgpt", "claude", "gemini", "copilot",
    "visual studio code", "vscode", "- code",
    "jupyter", "colab", "notebook",
    "pdf", "arxiv", "research paper",
    "course", "lecture", "lesson", "udemy", "coursera",
    "python", "javascript", "typescript", "rust", "golang",
    "react", "angular", "vue", "node.js", "next.js",
    "machine learning", "deep learning", "neural network",
    "algorithm", "data structure", "leetcode",
    "wikipedia", "geeksforgeeks",
    "docker", "kubernetes", "aws", "azure",
    "sql", "database", "postgresql", "mongodb",
];

fn is_educational(text: &str) -> bool {
    let lower = text.to_lowercase();
    EDUCATIONAL_KEYWORDS.iter().any(|kw| lower.contains(kw))
        || EDUCATIONAL_APPS.iter().any(|app| lower.contains(app))
}

/// Applications that are themselves a strong signal of learning activity.
/// On macOS the window title is unavailable without Screen Recording
/// permission, so the application name is often all we have to work with.
const EDUCATIONAL_APPS: &[&str] = &[
    "code", "visual studio code", "cursor", "zed", "sublime text",
    "intellij", "pycharm", "webstorm", "goland", "clion", "rustrover",
    "xcode", "android studio", "jupyter", "rstudio",
    "terminal", "iterm", "warp", "alacritty", "kitty",
    "preview", "books", "obsidian", "notion", "zotero",
];

/// A snapshot of whatever the user currently has in the foreground.
#[derive(Debug, Clone, Default)]
pub struct ActiveWindowSnapshot {
    pub title: String,
    pub app_name: String,
}

impl ActiveWindowSnapshot {
    /// Text used for educational keyword matching. The app name is included
    /// because macOS hides window titles unless Screen Recording is granted.
    fn searchable(&self) -> String {
        format!("{} {}", self.app_name, self.title)
    }

    /// A stable identity for "the thing the user is looking at". Used to detect
    /// context switches. Falls back to the app name when the title is hidden.
    pub fn identity(&self) -> String {
        if self.title.trim().is_empty() {
            self.app_name.clone()
        } else {
            format!("{} — {}", self.app_name, self.title)
        }
    }

    pub fn is_empty(&self) -> bool {
        self.title.trim().is_empty() && self.app_name.trim().is_empty()
    }
}

/// Read the foreground window on macOS, Windows, or Linux.
///
/// Backed by `active-win-pos-rs`, so there is a single code path for every
/// platform instead of a Windows-only implementation with a stub elsewhere.
///
/// macOS note: `title` comes back empty unless the user grants Screen
/// Recording permission to the agent. `app_name` is always populated, so
/// detection degrades gracefully rather than failing outright.
fn get_active_window_snapshot() -> Option<ActiveWindowSnapshot> {
    match active_win_pos_rs::get_active_window() {
        Ok(window) => {
            let snapshot = ActiveWindowSnapshot {
                title: window.title,
                app_name: window.app_name,
            };
            if snapshot.is_empty() {
                None
            } else {
                Some(snapshot)
            }
        }
        Err(_) => None,
    }
}

const MIN_QUIZ_TIME: u64 = 60;
const MIN_EVENT_TIME: u64 = 10;

pub fn start_monitor(
    app_handle: AppHandle,
    app_state: &'static AppState,
    event_queue: &'static EventQueue,
    monitor_state: &'static MonitorState,
    session_manager: &'static SessionManager,
) {
    thread::spawn(move || {
        let mut last: Option<ActiveWindowSnapshot> = None;
        let mut window_start = Instant::now();

        loop {
            thread::sleep(Duration::from_secs(3));

            // Two gates. The local pause switch, and whether a shared session is
            // actually running with this agent participating. The second is new:
            // the agent used to record from the moment it launched, before the
            // user had even signed in.
            let is_on = { *monitor_state.is_monitoring.lock().unwrap() };
            if !is_on || !session_manager.is_capturing() {
                // Drop the previous window so time spent while paused is not
                // later attributed as study time.
                last = None;
                window_start = Instant::now();
                continue;
            }

            let current = match get_active_window_snapshot() {
                Some(snapshot) => snapshot,
                None => continue,
            };

            // Update the state the UI reads.
            let edu = is_educational(&current.searchable());
            let elapsed = window_start.elapsed().as_secs();
            {
                let mut cw = monitor_state.current_window.lock().unwrap();
                cw.title = current.identity();
                cw.process_name = current.app_name.clone();
                cw.is_educational = edu;
                cw.seconds = elapsed;
            }

            // Context switched — process the window the user just left.
            let switched = last
                .as_ref()
                .map(|prev| prev.identity() != current.identity())
                .unwrap_or(true);

            if switched {
                if let Some(prev) = last.take() {
                    let time_on_old = window_start.elapsed().as_secs();
                    let was_edu = is_educational(&prev.searchable());

                    if was_edu && time_on_old >= MIN_EVENT_TIME {
                        event_queue.push(LearningEvent {
                            event_type: "WindowFocused".to_string(),
                            source: "desktop".to_string(),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            topic: Some(prev.identity()),
                            metadata: serde_json::json!({
                                "duration_seconds": time_on_old,
                                "window_title": prev.title,
                                "app_name": prev.app_name,
                            }),
                        });

                        // Trigger a quiz once they've spent real time on it.
                        if time_on_old >= MIN_QUIZ_TIME {
                            quiz::trigger_quiz(
                                &app_handle,
                                app_state,
                                &prev.identity(),
                                time_on_old,
                            );
                        }
                    }
                }

                last = Some(current);
                window_start = Instant::now();
            }
        }
    });
}

#[tauri::command]
pub fn get_current_window(monitor: State<'_, &'static MonitorState>) -> Result<serde_json::Value, String> {
    let cw = monitor.current_window.lock().unwrap();
    Ok(serde_json::json!({
        "title": cw.title,
        "process": cw.process_name,
        "educational": cw.is_educational,
        "seconds": cw.seconds,
    }))
}

#[tauri::command]
pub fn toggle_monitoring(monitor: State<'_, &'static MonitorState>) -> Result<bool, String> {
    let mut is_on = monitor.is_monitoring.lock().unwrap();
    *is_on = !*is_on;
    Ok(*is_on)
}
