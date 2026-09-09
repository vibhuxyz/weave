//! Tauri shell.
//!
//! It owns one child process: the Node ACP server (`server/index.ts`), which
//! in turn spawns `claude-agent-acp`. Same shape as Berd owning `goosed` — the
//! Rust side spawns, supervises, and kills; the renderer only talks to it over
//! a localhost WebSocket.

use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent, State};

const SERVER_PORT: u16 = 8137;

/// How long the ACP server gets to shut down cleanly before it is SIGKILLed.
const SERVER_SHUTDOWN: Duration = Duration::from_secs(3);

/// How long quit will wait for container teardown. A wedged Docker daemon
/// must never hold the app open.
const QUIT_TEARDOWN: Duration = Duration::from_secs(5);

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
    if let Ok(home) = std::env::var("HOME") {
        let home_path = PathBuf::from(home);
        dirs.push(home_path.join(".local").join("bin"));
        dirs.push(home_path.join(".cargo").join("bin"));
        dirs.push(home_path.join("bin"));
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
    /// The project this server is currently pointed at. Used to tell a real
    /// project switch (the end of a session) from a restart of the same one.
    project_dir: Mutex<Option<String>>,
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
            // SIGTERM first. The server spawns engines into their own process
            // groups, so it is the only thing that can reap them — a straight
            // SIGKILL here would leave every engine, and anything an engine
            // backgrounded, running after we quit.
            #[cfg(unix)]
            {
                let _ = Command::new("kill").arg(child.id().to_string()).status();
                let deadline = Instant::now() + SERVER_SHUTDOWN;
                while Instant::now() < deadline && !matches!(child.try_wait(), Ok(Some(_))) {
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileTreeEntry {
    name: String,
    path: String,
    kind: String,
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

/// Save the preferred engine id so restarts open with the chosen engine.
#[tauri::command]
fn save_engine_id(app: tauri::AppHandle, engine_id: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    let mut settings = read_settings(&app);
    settings.engine_id = Some(engine_id);
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())?;
    Ok(())
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

#[tauri::command]
fn check_installed_engines(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = engines_dir(&app)?;
    let node_modules = dir.join("node_modules");
    let mut installed = Vec::new();

    for (id, pkg) in [
        ("claude-code", "@agentclientprotocol/claude-agent-acp"),
        ("codex", "@agentclientprotocol/codex-acp"),
        ("amp", "@sourcegraph/amp"),
        ("antigravity", "agy-acp"),
    ] {
        let pkg_path = if pkg.starts_with('@') {
            let parts: Vec<&str> = pkg.split('/').collect();
            if parts.len() == 2 {
                node_modules.join(parts[0]).join(parts[1])
            } else {
                node_modules.join(pkg)
            }
        } else {
            node_modules.join(pkg)
        };

        if pkg_path.join("package.json").exists() {
            installed.push(id.to_string());
        }
    }

    Ok(installed)
}

#[tauri::command]
async fn uninstall_engine(app: tauri::AppHandle, package_name: String) -> Result<(), String> {
    let node = node()?;
    let npm = npm_beside(node)?;
    let dir = engines_dir(&app)?;

    let output = Command::new(&npm)
        .args(["uninstall", "--loglevel=error"])
        .arg("--prefix")
        .arg(&dir)
        .arg(&package_name)
        .current_dir(&dir)
        .env("PATH", child_path(node))
        .output()
        .map_err(|e| format!("failed to run npm: {e}"))?;

    // Explicitly ensure package directory is removed from node_modules
    let pkg_path = if package_name.starts_with('@') {
        let parts: Vec<&str> = package_name.split('/').collect();
        if parts.len() == 2 {
            dir.join("node_modules").join(parts[0]).join(parts[1])
        } else {
            dir.join("node_modules").join(&package_name)
        }
    } else {
        dir.join("node_modules").join(&package_name)
    };

    if pkg_path.exists() {
        let _ = std::fs::remove_dir_all(&pkg_path);
    }

    if package_name.starts_with('@') {
        let parts: Vec<&str> = package_name.split('/').collect();
        if parts.len() == 2 {
            let scope_dir = dir.join("node_modules").join(parts[0]);
            if scope_dir.exists() {
                if let Ok(mut read) = std::fs::read_dir(&scope_dir) {
                    if read.next().is_none() {
                        let _ = std::fs::remove_dir(&scope_dir);
                    }
                }
            }
        }
    }

    if !output.status.success() && pkg_path.exists() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Could not uninstall {package_name}: {stderr}"));
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

// ---------------------------------------------------------------------------
// Docker-backed services
//
// Containers are the one thing this app can leak. A dev server the agent
// starts lives inside our process tree and dies with it; a container is owned
// by the Docker daemon and outlives quit. So the running-services list has to
// come from `docker ps` rather than from the chat transcript — a transcript is
// per-session, and the container is not — and quit has to take down whatever
// came up while we were running.

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DockerService {
    id: String,
    name: String,
    image: String,
    /// Published host ports, in the order Docker reports them.
    ports: Vec<u16>,
    compose_project: Option<String>,
    /// `com.docker.compose.project.working_dir`, when the container came from
    /// a compose file. This is what ties a container to a Weave project.
    working_dir: Option<String>,
}

/// Which containers this app is responsible for.
///
/// Everything already up at launch belongs to whoever started it — a stack the
/// user runs by hand in a terminal must survive us quitting. Only ids that
/// appear *after* that first snapshot are ours to stop.
#[derive(Default)]
struct ContainerRegistry {
    /// `None` until the first `docker ps` that actually answered.
    baseline: Mutex<Option<HashSet<String>>>,
    ours: Mutex<HashSet<String>>,
}

const PS_FORMAT: &str = "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}\t\
                         {{.Label \"com.docker.compose.project\"}}\t\
                         {{.Label \"com.docker.compose.project.working_dir\"}}";

/// Host-side ports out of a `{{.Ports}}` cell, which reads like
/// `0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp`. Unpublished ports have no
/// `->` and are skipped: nothing on the host can reach them.
fn published_ports(ports: &str) -> Vec<u16> {
    let mut out: Vec<u16> = Vec::new();
    for mapping in ports.split(',') {
        let Some((host, _)) = mapping.split_once("->") else {
            continue;
        };
        let Some(port) = host.rsplit(':').next() else {
            continue;
        };
        if let Ok(n) = port.trim().parse::<u16>() {
            if !out.contains(&n) {
                out.push(n);
            }
        }
    }
    out
}

/// `None` when Docker could not be asked at all (not installed, daemon down),
/// which is different from "asked, nothing running" and must not be allowed to
/// poison the baseline.
/// One tab-separated `docker ps` row. Missing trailing fields are normal:
/// a container with no compose labels simply has empty cells.
fn parse_ps_line(line: &str) -> Option<DockerService> {
    let nonempty = |s: &str| (!s.trim().is_empty()).then(|| s.trim().to_string());
    let mut f = line.split('\t');
    let id = f.next()?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    Some(DockerService {
        id,
        name: f.next().unwrap_or_default().trim().to_string(),
        image: f.next().unwrap_or_default().trim().to_string(),
        ports: published_ports(f.next().unwrap_or_default()),
        compose_project: f.next().and_then(nonempty),
        working_dir: f.next().and_then(nonempty),
    })
}

fn docker_ps() -> Option<Vec<DockerService>> {
    let out = Command::new("docker")
        .args(["ps", "--format", PS_FORMAT])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter_map(parse_ps_line)
            .collect(),
    )
}

/// Every running container, and a note of which ones arrived on our watch.
///
/// Polled by the renderer. Returns an empty list rather than an error when
/// Docker is absent — plenty of projects never touch it, and an error here
/// would surface as a broken panel.
#[tauri::command]
fn docker_services(registry: State<'_, ContainerRegistry>) -> Vec<DockerService> {
    let Some(services) = docker_ps() else {
        return Vec::new();
    };

    let mut baseline = registry.baseline.lock().unwrap();
    match baseline.as_ref() {
        None => *baseline = Some(services.iter().map(|s| s.id.clone()).collect()),
        Some(pre) => {
            let mut ours = registry.ours.lock().unwrap();
            for service in &services {
                if !pre.contains(&service.id) {
                    ours.insert(service.id.clone());
                }
            }
        }
    }

    services
}

/// Stop `service` — the whole compose stack when it has one, since a
/// compose-started Postgres rarely wants to outlive its Redis.
///
/// `stop`, never `rm -f`: the container is kept, named volumes survive, and
/// `docker compose up` brings the data straight back.
fn stop_service(service: &DockerService) {
    match service.compose_project.as_deref() {
        Some(project) => {
            let _ = Command::new("docker")
                .args(["compose", "-p", project, "stop"])
                .status();
        }
        None => {
            let _ = Command::new("docker").args(["stop", &service.id]).status();
        }
    }
}

/// Stop one container by id, from the Stop button on a container row.
///
/// Distinct from `kill_port`: there we only know a port and have to work back
/// through the proxy process to find the container. Here the renderer already
/// polled `docker_services` and knows exactly which one it means.
#[tauri::command]
fn stop_container(id: String) -> Result<(), String> {
    let services = docker_ps().ok_or("Docker is not available")?;
    let service = services
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("Container {id} is no longer running"))?;
    stop_service(service);
    Ok(())
}

/// Take down the containers that came up on our watch.
///
/// Called at both boundaries that end a session: switching to another project,
/// and quitting. Afterwards the registry is reset, so anything still standing
/// (a stack the user started by hand, or one that refused to stop) counts as
/// pre-existing from here on and is never touched again.
fn stop_our_containers(registry: &ContainerRegistry) {
    let ours = std::mem::take(&mut *registry.ours.lock().unwrap());
    if ours.is_empty() {
        return;
    }

    let worker = std::thread::spawn(move || {
        let Some(services) = docker_ps() else {
            return;
        };
        // One `compose stop` covers every container in its stack, so key the
        // work by project and fall back to the id for standalone containers.
        let mut handled: HashSet<String> = HashSet::new();
        for service in services.iter().filter(|s| ours.contains(&s.id)) {
            let key = service
                .compose_project
                .clone()
                .unwrap_or_else(|| service.id.clone());
            if handled.insert(key) {
                stop_service(service);
            }
        }
    });

    let deadline = Instant::now() + QUIT_TEARDOWN;
    while !worker.is_finished() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }

    // Re-baseline against whatever survived.
    if let Some(remaining) = docker_ps() {
        *registry.baseline.lock().unwrap() =
            Some(remaining.into_iter().map(|s| s.id).collect());
    }
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
        let services = docker_ps().unwrap_or_default();
        if let Some(service) = services.iter().find(|s| s.ports.contains(&port)) {
            stop_service(service);
            return Ok(());
        }
        return Err(format!(
            "Port {port} is held by a container proxy, but no matching Docker \
             container was found to stop."
        ));
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

#[tauri::command]
fn list_directory_entries(path: String) -> Result<Vec<FileTreeEntry>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let read_dir = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".git" || file_name == ".DS_Store" {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let is_dir = if file_type.is_symlink() {
            entry.path().is_dir()
        } else {
            file_type.is_dir()
        };

        entries.push(FileTreeEntry {
            name: file_name,
            path: entry.path().to_string_lossy().to_string(),
            kind: if is_dir { "directory".into() } else { "file".into() },
        });
    }

    entries.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("directory", "file") => std::cmp::Ordering::Less,
        ("file", "directory") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
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
    containers: State<'_, ContainerRegistry>,
    project_dir: String,
    engine_id: Option<String>,
) -> Result<u16, String> {
    if !PathBuf::from(&project_dir).is_dir() {
        return Err(format!("Not a folder: {project_dir}"));
    }

    // Moving to a different project ends the session that was running. Take
    // its containers down before the next one starts — but not when the same
    // project is merely restarting (an engine switch), where the user is still
    // sitting in front of the database they just built.
    let previous = server.project_dir.lock().unwrap().clone();
    if previous.is_some_and(|dir| dir != project_dir) {
        stop_our_containers(&containers);
    }

    let launch = server_launch(&app)?;
    let engines = engines_dir(&app)?;

    server.restart(&launch, &project_dir, engine_id.as_deref(), &engines)?;
    server.wait_until_listening(SERVER_PORT, Duration::from_secs(20))?;
    *server.project_dir.lock().unwrap() = Some(project_dir.clone());

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
        .manage(ContainerRegistry::default())
        .invoke_handler(tauri::generate_handler![
            get_saved_project,
            save_engine_id,
            install_engine,
            uninstall_engine,
            check_installed_engines,
            start_agent_server,
            port_info,
            kill_port,
            docker_services,
            stop_container,
            list_directory_entries
        ])
        .build(tauri::generate_context!())
        .expect("error building the app")
        .run(|app, event| {
            // Never leave an orphaned node process behind — nor a
            // container, which the daemon would otherwise keep running long
            // after the app that started it is gone.
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                app.state::<AgentServer>().stop();
                stop_our_containers(&app.state::<ContainerRegistry>());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_compose_row() {
        let line = "16f7fd6ec45a\ttodo-redis\tredis:7-alpine\t                    0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp\t                    todo-app\t/Users/xyz/Coding/todo-app";
        let service = parse_ps_line(line).expect("row should parse");
        assert_eq!(service.id, "16f7fd6ec45a");
        assert_eq!(service.name, "todo-redis");
        assert_eq!(service.image, "redis:7-alpine");
        // Both the v4 and v6 mappings publish 6379; it is one port, not two.
        assert_eq!(service.ports, vec![6379]);
        assert_eq!(service.compose_project.as_deref(), Some("todo-app"));
        assert_eq!(
            service.working_dir.as_deref(),
            Some("/Users/xyz/Coding/todo-app")
        );
    }

    #[test]
    fn a_container_without_compose_labels_has_no_project() {
        let line = "abc123\tpg\tpostgres:16\t0.0.0.0:5432->5432/tcp\t\t";
        let service = parse_ps_line(line).expect("row should parse");
        assert_eq!(service.ports, vec![5432]);
        assert!(service.compose_project.is_none());
        assert!(service.working_dir.is_none());
    }

    /// An unpublished port is unreachable from the host, so it is not a port
    /// the user could have been using — and `kill_port` could never match it.
    #[test]
    fn unpublished_ports_are_ignored() {
        assert!(published_ports("5432/tcp").is_empty());
        assert_eq!(published_ports("127.0.0.1:8080->80/tcp, 9229/tcp"), vec![8080]);
    }

    #[test]
    fn multiple_published_ports_are_all_reported() {
        assert_eq!(
            published_ports("0.0.0.0:5672->5672/tcp, 0.0.0.0:15672->15672/tcp"),
            vec![5672, 15672]
        );
    }
}
