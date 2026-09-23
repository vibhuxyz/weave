use crate::agents::agent_env::agent_path;
use std::path::Path;
use std::process::Command;

pub struct CliAuthResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

pub fn run_cli_login(program: &Path, args: &[&str]) -> Result<CliAuthResult, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);

    cmd.env("PATH", agent_path(program));

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run {}: {}", program.display(), e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr);

    Ok(CliAuthResult {
        success: output.status.success(),
        output: combined,
        error: if output.status.success() {
            None
        } else {
            Some(stderr)
        },
    })
}
