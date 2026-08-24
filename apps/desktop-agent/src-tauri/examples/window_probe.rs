//! Diagnostic probe for active-window detection.
//!
//! Run from apps/desktop-agent/src-tauri:
//!     cargo run --example window_probe
//!
//! Prints the foreground window once a second for 5 samples. Use this to
//! confirm the agent can see your windows on a given OS, and to check whether
//! macOS is withholding window titles (which needs Screen Recording
//! permission — the app name is still reported without it).

fn main() {
    println!("platform: {}", std::env::consts::OS);
    println!("sampling the active window 5 times, 1s apart\n");

    let mut titles_seen = 0;

    for i in 1..=5 {
        match active_win_pos_rs::get_active_window() {
            Ok(w) => {
                let title = if w.title.trim().is_empty() {
                    "<empty>".to_string()
                } else {
                    titles_seen += 1;
                    w.title.clone()
                };
                println!(
                    "{}. app={:?} title={:?} pid={}",
                    i, w.app_name, title, w.process_id
                );
            }
            Err(_) => println!("{}. <no active window detected>", i),
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    println!();
    if cfg!(target_os = "macos") && titles_seen == 0 {
        println!("No window titles were returned.");
        println!("On macOS this is expected until Screen Recording permission is granted.");
        println!("Detection still works off the application name.");
    } else {
        println!("Window titles available: {}/5 samples.", titles_seen);
    }
}
