use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningEvent {
    pub event_type: String,
    pub source: String,
    pub timestamp: String,
    pub topic: Option<String>,
    pub metadata: serde_json::Value,
}

pub struct EventQueue {
    pub events: Mutex<Vec<LearningEvent>>,
}

impl Default for EventQueue {
    fn default() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
        }
    }
}

impl EventQueue {
    pub fn push(&self, event: LearningEvent) {
        let mut queue = self.events.lock().unwrap();
        queue.push(event);
    }

    pub fn drain(&self) -> Vec<LearningEvent> {
        let mut queue = self.events.lock().unwrap();
        queue.drain(..).collect()
    }

    pub fn size(&self) -> usize {
        self.events.lock().unwrap().len()
    }
}

#[tauri::command]
pub fn get_queue_size(queue: State<'_, &'static EventQueue>) -> Result<usize, String> {
    Ok(queue.size())
}

#[tauri::command]
pub fn get_recent_events(queue: State<'_, &'static EventQueue>) -> Result<Vec<serde_json::Value>, String> {
    let events = queue.events.lock().unwrap();
    let recent: Vec<serde_json::Value> = events.iter().rev().take(10).map(|e| {
        serde_json::json!({
            "type": e.event_type,
            "source": e.source,
            "topic": e.topic,
            "timestamp": e.timestamp,
        })
    }).collect();
    Ok(recent)
}
