//! Tauri shell.
//!
//! It owns one child process: the Node ACP server (`server/index.ts`), which
//! in turn spawns `claude-agent-acp`. Same shape as Berd owning `goosed` — the
//! Rust side spawns, supervises, and kills; the renderer only talks to it over
//! a localhost WebSocket.

use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent, State};

const SERVER_PORT: u16 = 8137;

#[derive(Default)]
struct AgentServer {
    child: Mutex<Option<Child>>,
}

impl AgentServer {
    /// Replace any running server with one rooted at `project_dir`.
    fn restart(&self, repo_root: &PathBuf, project_dir: &str) -> Result<(), String> {
        self.stop();

        let entry = repo_root.join("server").join("index.ts");
        if !entry.exists() {
            return Err(format!("ACP server not found at {}", entry.display()));
        }

        let child = Command::new("node")
            .arg("--experimental-strip-types")
            .arg(&entry)
            .current_dir(repo_root)
            .env("PROJECT_DIR", project_dir)
            .stdin(Stdio::null())
            // Inherit so the agent's own errors reach the terminal running
            // `pnpm tauri dev`. Piping without draining would deadlock it.
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("failed to spawn node: {e}"))?;

        *self.child.lock().unwrap() = Some(child);
        Ok(())
    }

    /// Spawning is not readiness: node needs a moment to bind the port. Poll
    /// until it accepts a connection so the renderer is never told "ready"
    /// before it can actually dial in.
    fn wait_until_listening(&self, port: u16, timeout: Duration) -> Result<(), String> {
        let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
        let deadline = Instant::now() + timeout;

        while Instant::now() < deadline {
            if TcpStream::connect_timeout(&addr.into(), Duration::from_millis(200)).is_ok() {
                return Ok(());
            }
            // Surface an early crash (bad node, syntax error) instead of
            // silently waiting out the whole timeout.
            if let Some(child) = self.child.lock().unwrap().as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(format!("ACP server exited early: {status}"));
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        Err(format!("ACP server did not start listening on port {port}"))
    }

    fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct Settings {
    project_dir: Option<String>,
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &tauri::AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// The folder chosen last run, if it still exists.
#[tauri::command]
fn get_saved_project(app: tauri::AppHandle) -> Option<String> {
    read_settings(&app)
        .project_dir
        .filter(|dir| PathBuf::from(dir).is_dir())
}

/// Point the agent at `project_dir` and (re)start the server. Returns the port.
#[tauri::command]
fn start_agent_server(
    app: tauri::AppHandle,
    server: State<'_, AgentServer>,
    project_dir: String,
) -> Result<u16, String> {
    if !PathBuf::from(&project_dir).is_dir() {
        return Err(format!("Not a folder: {project_dir}"));
    }

    // In dev the repo root is the parent of src-tauri; in a bundle the server
    // ships as a resource. Only dev is wired up for now.
    let repo_root = std::env::current_dir()
        .map_err(|e| format!("cwd failed: {e}"))?
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve repo root".to_string())?;

    server.restart(&repo_root, &project_dir)?;
    server.wait_until_listening(SERVER_PORT, Duration::from_secs(20))?;

    if let Ok(path) = settings_path(&app) {
        let settings = Settings {
            project_dir: Some(project_dir),
        };
        if let Ok(raw) = serde_json::to_string_pretty(&settings) {
            let _ = std::fs::write(path, raw);
        }
    }

    Ok(SERVER_PORT)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AgentServer::default())
        .invoke_handler(tauri::generate_handler![
            get_saved_project,
            start_agent_server
        ])
        .build(tauri::generate_context!())
        .expect("error building the app")
        .run(|app, event| {
            // Never leave an orphaned node process behind.
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                app.state::<AgentServer>().stop();
            }
        });
}
