use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};

use crate::auth::AppState;
use crate::events::{EventQueue, LearningEvent};
use crate::quiz;

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

fn is_educational(title: &str) -> bool {
    let lower = title.to_lowercase();
    EDUCATIONAL_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

#[cfg(windows)]
fn get_active_window_title() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(not(windows))]
fn get_active_window_title() -> Option<String> {
    None
}

const MIN_QUIZ_TIME: u64 = 60;
const MIN_EVENT_TIME: u64 = 10;

pub fn start_monitor(
    app_handle: AppHandle,
    app_state: &'static AppState,
    event_queue: &'static EventQueue,
    monitor_state: &'static MonitorState,
) {
    thread::spawn(move || {
        let mut last_title = String::new();
        let mut window_start = Instant::now();

        loop {
            thread::sleep(Duration::from_secs(3));

            let is_on = { *monitor_state.is_monitoring.lock().unwrap() };
            if !is_on {
                continue;
            }

            let title = match get_active_window_title() {
                Some(t) if !t.is_empty() => t,
                _ => continue,
            };

            // Update UI state
            let edu = is_educational(&title);
            let elapsed = window_start.elapsed().as_secs();
            {
                let mut cw = monitor_state.current_window.lock().unwrap();
                cw.title = title.clone();
                cw.is_educational = edu;
                cw.seconds = elapsed;
            }

            // Window changed — process the old one
            if title != last_title {
                let time_on_old = window_start.elapsed().as_secs();
                let was_edu = is_educational(&last_title);

                if !last_title.is_empty() && was_edu && time_on_old >= MIN_EVENT_TIME {
                    // Log event
                    event_queue.push(LearningEvent {
                        event_type: "WindowFocused".to_string(),
                        source: "desktop".to_string(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        topic: Some(last_title.clone()),
                        metadata: serde_json::json!({
                            "duration_seconds": time_on_old,
                            "window_title": last_title,
                        }),
                    });

                    // Trigger quiz if spent 60+ seconds
                    if time_on_old >= MIN_QUIZ_TIME {
                        quiz::trigger_quiz(&app_handle, app_state, &last_title, time_on_old);
                    }
                }

                last_title = title;
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
