use crate::agents::agent_env::agent_path;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use tauri::AppHandle;

fn search_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home_path = PathBuf::from(home);
        dirs.push(home_path.join(".local").join("bin"));
        dirs.push(home_path.join(".cargo").join("bin"));
        dirs.push(home_path.join(".npm-global").join("bin"));
        dirs.push(home_path.join("Library/Application Support/dev.vibhu.weave/engines/node_modules/.bin"));
        dirs.push(home_path.join("Library/Application Support/dev.vibhu.weave/engines/node_modules/@agentclientprotocol/claude-agent-acp"));
        dirs.push(home_path.join("Library/Application Support/dev.vibhu.weave/engines/node_modules/@agentclientprotocol/codex-acp"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs.push(PathBuf::from("/usr/bin"));
    dirs.push(PathBuf::from("/bin"));
    let _ = app;
    dirs
}

pub fn resolve_binary(name: &str, app: &AppHandle) -> Option<PathBuf> {
    if Path::new(name).is_absolute() && Path::new(name).exists() {
        return Some(PathBuf::from(name));
    }
    for dir in search_dirs(app) {
        let candidate = dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

pub fn spawn_agent_process(
    program: &Path,
    args: &[&str],
    pipe_stdin: bool,
    pipe_stdout: bool,
) -> Result<Child, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);

    if let Some(parent) = program.parent() {
        cmd.current_dir(parent);
    }

    cmd.env("PATH", agent_path(program));

    cmd.stdin(if pipe_stdin { Stdio::piped() } else { Stdio::inherit() });
    cmd.stdout(if pipe_stdout { Stdio::piped() } else { Stdio::inherit() });
    cmd.stderr(Stdio::piped());

    cmd.spawn().map_err(|e| format!("Failed to spawn {}: {}", program.display(), e))
}
