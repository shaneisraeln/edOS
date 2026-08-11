# edOS Desktop Agent

A Tauri-based desktop agent that runs in the background and observes learning activity.

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

## Setup

```bash
# Install Tauri CLI
cargo install tauri-cli

# Run in development mode
cd src-tauri
cargo tauri dev

# Build for production
cargo tauri build
```

## Architecture

- `src-tauri/src/main.rs` — Tauri app entry point
- `src-tauri/src/auth.rs` — Authentication (login/logout/token management)
- `src-tauri/src/events.rs` — Event queue and creation
- `src-tauri/src/session.rs` — Learning session management
- `src-tauri/src/sync.rs` — Periodic sync to edOS API

## How It Works

1. User signs in with their edOS credentials
2. The agent collects learning events (browser, IDE, documents)
3. Events are queued locally and synced to the API every 30 seconds
4. The Context Engine on the backend processes events and updates the knowledge graph
