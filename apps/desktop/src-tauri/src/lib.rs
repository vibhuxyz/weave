//! Tauri shell.
//!
//! It owns one child process: the Node ACP server (`server/index.ts`), which
//! in turn spawns `claude-agent-acp`. Same shape as Berd owning `goosed` — the
//! Rust side spawns, supervises, and kills; the renderer only talks to it over
//! a localhost WebSocket.

use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent, State};

const SERVER_PORT: u16 = 8137;

/// The bundled server is compiled to plain ESM, so this is the real floor.
/// Dev additionally needs 22.6+ for `--experimental-strip-types`, which the
/// dev path checks separately.
const MIN_NODE_MAJOR: u32 = 18;

// ---------------------------------------------------------------------------
// Finding node
//
// A GUI app launched from Finder inherits LaunchServices' PATH —
// `/usr/bin:/bin:/usr/sbin:/sbin` — and nothing else. Homebrew, nvm, fnm,
// volta and asdf all live outside that, so `Command::new("node")` fails with
// ENOENT in a packaged app even though node is plainly installed.
//
// Ordered cheapest-first. The login-shell probe is last because it spawns an
// interactive shell, which costs ~100ms and runs the user's whole rc file.
// ---------------------------------------------------------------------------

static NODE: OnceLock<Result<PathBuf, String>> = OnceLock::new();

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// `node -v` → major version. Also proves the binary actually runs, which a
/// permissions check alone does not (a stale nvm shim resolves and then dies).
fn node_major(node: &Path) -> Option<u32> {
    let out = Command::new(node).arg("-v").output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()?
        .parse()
        .ok()
}

/// Anything already on PATH. Covers `pnpm tauri dev` from a terminal.
fn node_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join("node"))
        .find(|candidate| is_executable(candidate))
}

/// Every version manager's default layout, plus the two homebrew prefixes.
fn node_in_known_locations() -> Vec<PathBuf> {
    let mut found = Vec::new();
    let home = std::env::var("HOME").unwrap_or_default();

    for fixed in [
        "/opt/homebrew/bin/node", // homebrew, Apple silicon
        "/usr/local/bin/node",    // homebrew on Intel, and the official pkg
        "/usr/bin/node",
    ] {
        found.push(PathBuf::from(fixed));
    }
    if !home.is_empty() {
        found.push(PathBuf::from(&home).join(".volta/bin/node"));
        found.push(PathBuf::from(&home).join(".asdf/shims/node"));
        found.push(PathBuf::from(&home).join(".local/bin/node"));

        // nvm keeps one directory per installed version. Take the highest,
        // compared numerically — a lexical sort puts v9 above v20.
        let nvm = PathBuf::from(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm) {
            let mut versions: Vec<(Vec<u32>, PathBuf)> = entries
                .filter_map(|entry| entry.ok())
                .map(|entry| {
                    let parts = entry
                        .file_name()
                        .to_string_lossy()
                        .trim_start_matches('v')
                        .split('.')
                        .filter_map(|part| part.parse::<u32>().ok())
                        .collect::<Vec<_>>();
                    (parts, entry.path().join("bin/node"))
                })
                .filter(|(parts, _)| !parts.is_empty())
                .collect();
            versions.sort_by(|a, b| b.0.cmp(&a.0));
            found.extend(versions.into_iter().map(|(_, path)| path));
        }
    }
    found
}

/// Last resort: ask the user's login shell what *it* thinks PATH is.
///
/// `-ilc` because nvm and fnm initialise in `.zshrc`, which only an
/// **interactive** shell reads. A login shell alone misses them.
#[cfg(unix)]
fn node_from_login_shell() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let out = Command::new(shell)
        .args(["-ilc", "command -v node"])
        .output()
        .ok()?;
    let found = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with('/'))?
        .to_string();
    Some(PathBuf::from(found))
}

#[cfg(not(unix))]
fn node_from_login_shell() -> Option<PathBuf> {
    None
}

fn resolve_node() -> Result<PathBuf, String> {
    let candidates = node_on_path()
        .into_iter()
        .chain(node_in_known_locations())
        .chain(node_from_login_shell());

    let mut too_old: Option<(PathBuf, u32)> = None;
    for candidate in candidates {
        if !is_executable(&candidate) {
            continue;
        }
        match node_major(&candidate) {
            Some(major) if major >= MIN_NODE_MAJOR => return Ok(candidate),
            Some(major) => too_old.get_or_insert((candidate, major)),
            None => continue,
        };
    }

    Err(match too_old {
        Some((path, major)) => format!(
            "Weave needs Node {MIN_NODE_MAJOR} or newer. Found v{major} at {}.",
            path.display()
        ),
        None => "Weave could not find Node.js. Install it (https://nodejs.org) \
                 and reopen the app."
            .to_string(),
    })
}

fn node() -> Result<&'static Path, String> {
    NODE.get_or_init(resolve_node)
        .as_deref()
        .map_err(|error| error.clone())
}

/// npm ships beside node in every distribution and version manager.
fn npm_beside(node: &Path) -> Result<PathBuf, String> {
    let npm = node
        .parent()
        .ok_or_else(|| "node has no parent directory".to_string())?
        .join("npm");
    if is_executable(&npm) {
        return Ok(npm);
    }
    Err(format!(
        "Found node at {} but no npm beside it. Weave installs engines with npm.",
        node.display()
    ))
}

/// PATH for anything we spawn: node's own directory first, then the usual
/// prefixes, then whatever we inherited. Engines shell out to `git` and
/// friends, and the inherited PATH may be the Finder minimum.
fn child_path(node: &Path) -> String {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(bin) = node.parent() {
        dirs.push(bin.to_path_buf());
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    if let Some(inherited) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&inherited));
    }
    dirs.dedup();
    std::env::join_paths(dirs)
        .map(|joined| joined.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "/usr/bin:/bin".to_string())
}

#[derive(Default)]
struct AgentServer {
    child: Mutex<Option<Child>>,
}

/// Where the server lives and how to start it. Differs between a dev checkout
/// and a bundle, so it is resolved once and passed down rather than rederived.
struct ServerLaunch {
    entry: PathBuf,
    /// Node flags before the entry file. Empty for the bundled build.
    node_args: Vec<String>,
    /// Working directory for the server process.
    workdir: PathBuf,
}

impl AgentServer {
    fn restart(
        &self,
        launch: &ServerLaunch,
        project_dir: &str,
        engine_id: Option<&str>,
        engines_dir: &Path,
    ) -> Result<(), String> {
        self.stop();

        if !launch.entry.exists() {
            return Err(format!(
                "ACP server not found at {}",
                launch.entry.display()
            ));
        }

        let node = node()?;
        let mut cmd = Command::new(node);
        cmd.args(&launch.node_args)
            .arg(&launch.entry)
            .current_dir(&launch.workdir)
            .env("PROJECT_DIR", project_dir)
            // A bundle has no workspace to resolve engines from. This is what
            // `resolveEngineEntry` reads instead. See packages/agent/engines.ts.
            .env("WEAVE_ENGINES_DIR", engines_dir)
            .env("PATH", child_path(node));

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

/// Where engines are installed: `<appData>/engines`.
///
/// Never the workspace. `pnpm -F @weave/agent add` mutates a *source tree*,
/// and a shipped `.app` has no source tree to mutate — that command only ever
/// worked because the app was being run out of its own checkout.
///
/// The directory carries a private `package.json` so npm treats it as a
/// project root and does not walk upward looking for one.
fn engines_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no data dir: {e}"))?
        .join("engines");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;

    let manifest = dir.join("package.json");
    if !manifest.exists() {
        std::fs::write(
            &manifest,
            "{\n  \"name\": \"weave-engines\",\n  \"private\": true\n}\n",
        )
        .map_err(|e| format!("could not write {}: {e}", manifest.display()))?;
    }
    Ok(dir)
}

#[tauri::command]
async fn install_engine(app: tauri::AppHandle, package_name: String) -> Result<(), String> {
    let node = node()?;
    let npm = npm_beside(node)?;
    let dir = engines_dir(&app)?;

    let output = Command::new(&npm)
        .args(["install", "--no-audit", "--no-fund", "--loglevel=error"])
        .arg("--prefix")
        .arg(&dir)
        .arg(&package_name)
        .current_dir(&dir)
        .env("PATH", child_path(node))
        .output()
        .map_err(|e| format!("failed to run npm: {e}"))?;

    if !output.status.success() {
        // npm's actual complaint is far more useful than its exit code, and
        // this string is what the onboarding screen shows the user.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr
            .lines()
            .filter(|line| !line.trim().is_empty())
            .rev()
            .take(6)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "Could not install {package_name}.\n{}",
            if tail.is_empty() {
                format!("npm exited with {}", output.status)
            } else {
                tail
            }
        ));
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

/// macOS squats on well-known ports for its own services — 5000 and 7000 are
/// AirPlay Receiver (Control Center), which is why a freshly started dev
/// server on 5000 can show *that* as the listener instead of `node`. Never
/// let "Stop" touch anything under `/System/` or `/usr/libexec/`.
fn is_system_process(command: &str) -> bool {
    command.starts_with("/System/") || command.starts_with("/usr/libexec/")
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
    if is_system_process(&info.command) {
        return Err(format!(
            "Port {port} is held by macOS itself ({}), not a dev server — likely AirPlay \
             Receiver. Turn that off in System Settings \u{2192} General \u{2192} AirDrop & \
             Handoff, or have the server use a different port.",
            info.command
        ));
    }

    // Check if a Docker container is holding this port.
    let is_docker_proxy = info.command.contains("com.docker")
        || info.command.contains("orbstack")
        || info.command.contains("OrbStack")
        || info.command.contains("docker-proxy")
        || info.command.contains("vpnkit");

    if is_docker_proxy {
        if let Ok(out) = Command::new("docker")
            .args(["ps", "--format", "{{.ID}}\t{{.Ports}}"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let mut parts = line.split('\t');
                if let (Some(id), Some(ports)) = (parts.next(), parts.next()) {
                    if ports.contains(&format!(":{port}->")) || ports.contains(&format!(":{port}/")) {
                        let _ = Command::new("docker").args(["rm", "-f", id]).status();
                        return Ok(());
                    }
                }
            }
        }
        return Err(format!("Port {port} is held by a container proxy, but no matching Docker container was found to stop."));
    }

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

/// Node needs this for `--experimental-strip-types`. Only the dev path cares:
/// the bundled server is plain JS.
const MIN_NODE_MAJOR_FOR_TS: u32 = 22;

/// Decide which server to run.
///
/// Dev runs `server/index.ts` straight from the workspace with type
/// stripping, so editing the server needs no rebuild. Release runs the
/// prebundled `server.mjs` that ships as a Tauri resource.
///
/// **Dev is checked first, and that ordering is load-bearing.** `tauri dev`
/// also copies resources into `target/debug`, so a resource-first lookup would
/// find a stale bundle and silently stop picking up server edits — the kind of
/// bug you debug for an hour before noticing.
///
/// Neither branch touches `current_dir()`. A Finder-launched app has cwd `/`,
/// whose parent is `None`, which is what produced "could not resolve repo
/// root" the first time this was packaged.
fn server_launch(app: &tauri::AppHandle) -> Result<ServerLaunch, String> {
    let mut why_not_dev: Option<String> = None;

    if cfg!(debug_assertions) {
        // Baked in at compile time, so it survives any working directory.
        let desktop = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "CARGO_MANIFEST_DIR has no parent".to_string())?
            .to_path_buf();
        let entry = desktop.join("server").join("index.ts");

        if !entry.exists() {
            why_not_dev = Some(format!("no source at {}", entry.display()));
        } else {
            let node = node()?;
            match node_major(node) {
                Some(major) if major >= MIN_NODE_MAJOR_FOR_TS => {
                    return Ok(ServerLaunch {
                        entry,
                        node_args: vec!["--experimental-strip-types".to_string()],
                        workdir: desktop,
                    })
                }
                // Not fatal — fall through to the bundle, which is plain JS
                // and runs on anything from node 18.
                Some(major) => {
                    why_not_dev = Some(format!(
                        "dev runs TypeScript directly and needs node \
                         {MIN_NODE_MAJOR_FOR_TS}+, found v{major}"
                    ))
                }
                None => why_not_dev = Some(format!("could not run {}", node.display())),
            }
        }
    }

    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("server.mjs");
        if bundled.exists() {
            return Ok(ServerLaunch {
                entry: bundled,
                node_args: Vec::new(),
                workdir: resources,
            });
        }
    }

    Err(match why_not_dev {
        Some(reason) => format!(
            "No ACP server to run: {reason}, and no bundled server.mjs. \
             Run `pnpm -F desktop bundle:server`."
        ),
        None => "The ACP server is missing from this build. It should ship as \
                 `server.mjs` — check `bundle.resources` in tauri.conf.json."
            .to_string(),
    })
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

    let launch = server_launch(&app)?;
    let engines = engines_dir(&app)?;

    server.restart(&launch, &project_dir, engine_id.as_deref(), &engines)?;
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
