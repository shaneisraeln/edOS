#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod events;
mod monitor;
mod quiz;
mod session;
mod sync;

use auth::AppState;
use events::EventQueue;
use monitor::MonitorState;
use session::SessionManager;
use std::thread;
use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, CustomMenuItem};

lazy_static::lazy_static! {
    static ref APP_STATE: AppState = AppState::default();
    static ref EVENT_QUEUE: EventQueue = EventQueue::default();
    static ref MONITOR_STATE: MonitorState = MonitorState::default();
}

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Show"))
        .add_item(CustomMenuItem::new("pause", "Pause Monitoring"))
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "pause" => {
                    let mut is_on = MONITOR_STATE.is_monitoring.lock().unwrap();
                    *is_on = !*is_on;
                    let label = if *is_on { "Pause Monitoring" } else { "Resume Monitoring" };
                    let _ = app.tray_handle().get_item("pause").set_title(label);
                }
                "quit" => std::process::exit(0),
                _ => {}
            },
            SystemTrayEvent::DoubleClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .manage(&*APP_STATE as &'static AppState)
        .manage(&*EVENT_QUEUE as &'static EventQueue)
        .manage(&*MONITOR_STATE as &'static MonitorState)
        .manage(SessionManager::default())
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                if event.window().label() == "main" {
                    let _ = event.window().hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            auth::login,
            auth::logout,
            auth::get_status,
            session::start_session,
            session::end_session,
            events::get_queue_size,
            events::get_recent_events,
            monitor::get_current_window,
            monitor::toggle_monitoring,
        ])
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Ready = event {
                // Start monitor and sync AFTER the app is fully built
                let handle = app_handle.clone();
                monitor::start_monitor(handle, &APP_STATE, &EVENT_QUEUE, &MONITOR_STATE);
                sync::start_sync_loop(&APP_STATE, &EVENT_QUEUE);
            }
        });
}
