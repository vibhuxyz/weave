use crate::agents::agent_env::agent_path;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};

pub struct ProcessOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_capture(program: &Path, args: &[&str]) -> Result<ProcessOutput, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    cmd.env("PATH", agent_path(program));
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute {}: {}", program.display(), e))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(ProcessOutput {
        exit_code,
        stdout,
        stderr,
    })
}

pub fn read_child_stderr_tail(child: &mut std::process::Child, max_bytes: usize) -> String {
    if let Some(ref mut stderr) = child.stderr {
        let mut buffer = Vec::new();
        let mut take = stderr.take(max_bytes as u64);
        let _ = take.read_to_end(&mut buffer);
        String::from_utf8_lossy(&buffer).to_string()
    } else {
        String::new()
    }
}
