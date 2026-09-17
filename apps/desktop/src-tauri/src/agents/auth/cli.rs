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

    if let Some(path_var) = std::env::var_os("PATH") {
        let mut new_path = std::ffi::OsString::new();
        if let Some(parent) = program.parent() {
            new_path.push(parent);
            new_path.push(":");
        }
        if let Some(home) = std::env::var_os("HOME") {
            let local_bin = std::path::PathBuf::from(&home).join(".local").join("bin");
            new_path.push(local_bin);
            new_path.push(":");
        }
        new_path.push(path_var);
        cmd.env("PATH", new_path);
    }

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
