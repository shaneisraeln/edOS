use std::thread;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use crate::auth::AppState;
use crate::events::EventQueue;
use crate::quiz;
use crate::session::{self, SessionManager};

/// How often to check in with the server.
///
/// This has to be well under the server's knowledge-check interval, or a check
/// comes due and then waits for the next tick. At the old 30s tick a 60s check
/// could land half a minute late.
const PULSE_INTERVAL: Duration = Duration::from_secs(10);

/// Event flushing stays on a slower cadence — batching is the point.
const FLUSH_INTERVAL: Duration = Duration::from_secs(30);

/// Background loop: keeps the shared session live, presents due knowledge
/// checks, and flushes captured events.
pub fn start_sync_loop(
    app_handle: AppHandle,
    app_state: &'static AppState,
    queue: &'static EventQueue,
    manager: &'static SessionManager,
) {
    thread::spawn(move || {
        // Check in immediately rather than leaving the agent idle for the first
        // tick — a session may already be running when the app launches.
        tick(&app_handle, app_state, manager);

        let mut last_flush = Instant::now();

        loop {
            thread::sleep(PULSE_INTERVAL);
            tick(&app_handle, app_state, manager);

            if last_flush.elapsed() >= FLUSH_INTERVAL {
                flush(app_state, queue, manager);
                last_flush = Instant::now();
            }
        }
    });
}

/// One pulse, plus whatever the server asked us to show.
fn tick(app_handle: &AppHandle, app_state: &'static AppState, manager: &'static SessionManager) {
    let outcome = session::pulse(app_state, manager);

    if let Some(check) = outcome.check {
        quiz::show_check(app_handle, app_state, &check);
    }

    if let Some(ended) = outcome.ended {
        // Say so, rather than just going quiet the way the agent used to. Guarded
        // so a repeated pulse cannot reopen the popup over the learner's work.
        if manager.claim_wrap_up(&ended.id) {
            // If the server bundled quiz questions, show them as a real popup.
            // Otherwise fall back to a summary card.
            if let Some(ref quiz) = ended.quiz {
                if !quiz.questions.is_empty() {
                    quiz::show_end_quiz(app_handle, app_state, &ended);
                } else {
                    quiz::show_wrap_up(
                        app_handle,
                        &ended.topic,
                        ended.elapsed_seconds,
                        ended.check_count,
                        &ended.reason,
                    );
                }
            } else {
                quiz::show_wrap_up(
                    app_handle,
                    &ended.topic,
                    ended.elapsed_seconds,
                    ended.check_count,
                    &ended.reason,
                );
            }
        }
    }
}

fn flush(app_state: &'static AppState, queue: &'static EventQueue, manager: &'static SessionManager) {
    let events = queue.drain();
    if events.is_empty() {
        return;
    }

    let token = {
        let auth = app_state.auth.lock().unwrap();
        match &auth.access_token {
            Some(t) => t.clone(),
            None => {
                requeue(queue, events);
                return;
            }
        }
    };

    // Without a session there is nothing to attribute these to. Hold them:
    // the user may be about to start one, and the API would otherwise store
    // them unattached.
    let session_id = match manager.session_id() {
        Some(id) => id,
        None => {
            requeue(queue, events);
            return;
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
                // Attribute to the shared session rather than letting the server guess.
                "sessionId": session_id,
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
                requeue(queue, events);
            }
        }
        Err(_) => requeue(queue, events),
    }
}

/// Put a failed batch back so nothing is lost when the API is unreachable.
fn requeue(queue: &'static EventQueue, events: Vec<crate::events::LearningEvent>) {
    for e in events {
        queue.push(e);
    }
}
