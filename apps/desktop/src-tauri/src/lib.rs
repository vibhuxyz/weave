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
    fn restart(&self, repo_root: &PathBuf, project_dir: &str, engine_id: Option<&str>) -> Result<(), String> {
        self.stop();

        let entry = repo_root.join("server").join("index.ts");
        if !entry.exists() {
            return Err(format!("ACP server not found at {}", entry.display()));
        }

        let mut cmd = Command::new("node");
        cmd.arg("--experimental-strip-types")
            .arg(&entry)
            .current_dir(repo_root)
            .env("PROJECT_DIR", project_dir);

        if let Some(id) = engine_id {
            cmd.env("ENGINE_ID", id);
        }

        let child = cmd
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
    engine_id: Option<String>,
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

#[derive(Serialize)]
struct SavedProject {
    dir: String,
    engine_id: Option<String>,
}

/// The folder chosen last run, if it still exists.
#[tauri::command]
fn get_saved_project(app: tauri::AppHandle) -> Option<SavedProject> {
    let settings = read_settings(&app);
    settings.project_dir.filter(|dir| PathBuf::from(dir).is_dir()).map(|dir| SavedProject {
        dir,
        engine_id: settings.engine_id,
    })
}

#[tauri::command]
async fn install_engine(package_name: String) -> Result<(), String> {
    let repo_root = std::env::current_dir()
        .map_err(|e| format!("cwd failed: {e}"))?
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve repo root".to_string())?;

    let status = Command::new("pnpm")
        .arg("-F")
        .arg("@weave/agent")
        .arg("add")
        .arg(&package_name)
        .current_dir(repo_root)
        .status()
        .map_err(|e| format!("failed to run pnpm: {e}"))?;

    if !status.success() {
        return Err(format!("pnpm install failed with status: {status}"));
    }

    Ok(())
}

#[derive(Serialize)]
struct PortInfo {
    pid: u32,
    command: String,
}

/// Who is listening on `port` (first PID), if anyone. Used to show what a
/// "Stop" will actually kill before doing it.
#[tauri::command]
fn port_info(port: u16) -> Option<PortInfo> {
    let out = Command::new("lsof")
        .args(["-nP", "-sTCP:LISTEN", "-t"])
        .arg(format!("-iTCP:{port}"))
        .output()
        .ok()?;
    let pid: u32 = String::from_utf8_lossy(&out.stdout)
        .split_whitespace()
        .next()?
        .parse()
        .ok()?;
    let comm = Command::new("ps")
        .args(["-o", "command=", "-p"])
        .arg(pid.to_string())
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    Some(PortInfo { pid, command: comm })
}

/// The whole `pid ppid` table, read once per kill so ancestor/descendant
/// walks don't each pay their own `ps` call.
#[cfg(unix)]
fn process_table() -> Vec<(u32, u32)> {
    let out = match Command::new("ps").args(["-Ao", "pid=,ppid="]).output() {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let pid: u32 = parts.next()?.parse().ok()?;
            let ppid: u32 = parts.next()?.parse().ok()?;
            Some((pid, ppid))
        })
        .collect()
}

/// `root` plus every process below it in the tree.
#[cfg(unix)]
fn descendants(table: &[(u32, u32)], root: u32) -> Vec<u32> {
    let mut tree = vec![root];
    let mut frontier = vec![root];
    while let Some(parent) = frontier.pop() {
        for &(pid, ppid) in table {
            if ppid == parent && !tree.contains(&pid) {
                tree.push(pid);
                frontier.push(pid);
            }
        }
    }
    tree
}

/// Walk upward from `pid`'s parent, stopping (without including) the first
/// process in `protected`, pid 1, or after `max_hops` — whichever comes
/// first. `protected` is this app's own process and everything under it, so
/// the walk can never reach past the shell/package-manager layer into our
/// own ACP server or Tauri itself.
#[cfg(unix)]
fn ancestors_until(table: &[(u32, u32)], pid: u32, protected: &[u32], max_hops: u32) -> Vec<u32> {
    let mut chain = Vec::new();
    let mut current = pid;
    for _ in 0..max_hops {
        let Some(&(_, ppid)) = table.iter().find(|&&(p, _)| p == current) else {
            break;
        };
        if ppid <= 1 || protected.contains(&ppid) {
            break;
        }
        chain.push(ppid);
        current = ppid;
    }
    chain
}

/// Kill whatever is listening on `port`, and the supervisor that respawns it.
///
/// The PID `port_info` reports is usually a worker under something that
/// restarts it on exit — `npm run dev`, `nodemon`, `ts-node-dev`, `node
/// --watch` — so SIGTERM-ing only that PID looked like Stop did nothing: the
/// supervisor relaunched a replacement on the same port before the next
/// check. This walks the process tree both ways from that PID (its own
/// descendants, and its ancestors up to but excluding this app's own
/// process) and takes the whole thing down, SIGKILL-ing any survivor.
///
/// The renderer confirms with the user first, using `port_info`.
#[tauri::command]
fn kill_port(port: u16, server: State<'_, AgentServer>) -> Result<(), String> {
    let info = port_info(port).ok_or_else(|| format!("nothing listening on :{port}"))?;

    #[cfg(unix)]
    {
        // Just the two PIDs, not their subtrees: `ancestors_until` only needs
        // to know where to stop climbing. This app's own subtree includes
        // the dev server we're trying to kill, so walking *its* descendants
        // here would mark our actual target "protected" and no-op the kill.
        let own_pid = std::process::id();
        let server_pid = server.child.lock().unwrap().as_ref().map(|c| c.id());
        let protected: Vec<u32> = std::iter::once(own_pid).chain(server_pid).collect();
        let table = process_table();

        let mut targets = descendants(&table, info.pid);
        for pid in ancestors_until(&table, info.pid, &protected, 12) {
            if !targets.contains(&pid) {
                targets.push(pid);
            }
        }
        targets.retain(|pid| !protected.contains(pid));

        for pid in &targets {
            let _ = Command::new("kill").arg(pid.to_string()).status();
        }

        std::thread::sleep(Duration::from_millis(300));

        if port_info(port).is_some() {
            for pid in &targets {
                let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
            }
        }
    }
    Ok(())
}

/// Point the agent at `project_dir` and (re)start the server. Returns the port.
#[tauri::command]
fn start_agent_server(
    app: tauri::AppHandle,
    server: State<'_, AgentServer>,
    project_dir: String,
    engine_id: Option<String>,
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

    server.restart(&repo_root, &project_dir, engine_id.as_deref())?;
    server.wait_until_listening(SERVER_PORT, Duration::from_secs(20))?;

    if let Ok(path) = settings_path(&app) {
        let settings = Settings {
            project_dir: Some(project_dir),
            engine_id,
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
        .plugin(tauri_plugin_opener::init())
        .manage(AgentServer::default())
        .invoke_handler(tauri::generate_handler![
            get_saved_project,
            install_engine,
            start_agent_server,
            port_info,
            kill_port
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
