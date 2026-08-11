use std::thread;
use std::time::Duration;

use crate::auth::AppState;
use crate::events::EventQueue;

/// Periodically flushes the event queue to the edOS API.
pub fn start_sync_loop(app_state: &'static AppState, queue: &'static EventQueue) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(30));
            flush(app_state, queue);
        }
    });
}

fn flush(app_state: &'static AppState, queue: &'static EventQueue) {
    let events = queue.drain();
    if events.is_empty() {
        return;
    }

    let token = {
        let auth = app_state.auth.lock().unwrap();
        match &auth.access_token {
            Some(t) => t.clone(),
            None => {
                for e in events {
                    queue.push(e);
                }
                return;
            }
        }
    };

    let url = format!("{}/ingest/events", app_state.api_url);
    let payload = serde_json::json!({
        "events": events.iter().map(|e| {
            serde_json::json!({
                "eventType": e.event_type,
                "source": e.source,
                "timestamp": e.timestamp,
                "topic": e.topic,
                "metadata": e.metadata,
            })
        }).collect::<Vec<_>>()
    });

    match ureq::post(&url)
        .set("Content-Type", "application/json")
        .set("Authorization", &format!("Bearer {}", token))
        .send_string(&payload.to_string())
    {
        Ok(res) => {
            if res.status() != 200 && res.status() != 202 {
                for e in events {
                    queue.push(e);
                }
            }
        }
        Err(_) => {
            for e in events {
                queue.push(e);
            }
        }
    }
}
