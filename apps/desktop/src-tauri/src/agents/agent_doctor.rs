use crate::agents::agent_process::run_capture;
use crate::agents::agent_spawn::resolve_binary;
use crate::agents::antigravity_doctor::check_antigravity_doctor;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthMethodInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentCapabilities {
    pub models: bool,
    pub reasoning: bool,
    pub tools: bool,
    pub sessions: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentDoctorResult {
    pub installed: bool,
    pub authenticated: bool,
    pub usable: bool,
    pub version: Option<String>,
    pub error: Option<String>,
    pub auth_methods: Vec<AuthMethodInfo>,
    pub capabilities: AgentCapabilities,
}

impl Default for AgentCapabilities {
    fn default() -> Self {
        Self {
            models: true,
            reasoning: true,
            tools: true,
            sessions: true,
        }
    }
}

pub fn empty_result() -> AgentDoctorResult {
    AgentDoctorResult {
        installed: false,
        authenticated: false,
        usable: false,
        version: None,
        error: None,
        auth_methods: Vec::new(),
        capabilities: AgentCapabilities::default(),
    }
}

fn check_claude_doctor(app: &AppHandle) -> AgentDoctorResult {
    let mut result = empty_result();
    let bin = resolve_binary("claude-agent-acp", app).or_else(|| resolve_binary("claude", app));

    let bin_path = match bin {
        Some(p) => p,
        None => return result,
    };

    result.installed = true;
    let status_out = run_capture(&bin_path, &["auth", "status"])
        .or_else(|_| run_capture(&bin_path, &["--cli", "auth", "status"]));

    if let Ok(out) = status_out {
        let combined = format!("{} {}", out.stdout, out.stderr);
        if combined.contains("\"loggedIn\":true")
            || combined.contains("\"loggedIn\": true")
            || combined.contains("Logged in")
        {
            result.authenticated = true;
            result.usable = true;
        }
    }

    if let Ok(v_out) = run_capture(&bin_path, &["--version"]) {
        result.version = Some(v_out.stdout.trim().to_string());
    }

    result
}

fn check_codex_doctor(app: &AppHandle) -> AgentDoctorResult {
    let mut result = empty_result();
    let bin = resolve_binary("codex-acp", app).or_else(|| resolve_binary("codex", app));

    let bin_path = match bin {
        Some(p) => p,
        None => return result,
    };

    result.installed = true;
    let status_out = run_capture(&bin_path, &["cli", "login", "status"])
        .or_else(|_| run_capture(&bin_path, &["login", "status"]))
        .or_else(|_| run_capture(&bin_path, &["auth", "status"]));

    if let Ok(out) = status_out {
        let combined = format!("{} {}", out.stdout, out.stderr);
        if combined.contains("\"loggedIn\":true")
            || combined.contains("\"loggedIn\": true")
            || combined.contains("Logged in")
        {
            result.authenticated = true;
            result.usable = true;
        }
    }

    if let Ok(v_out) = run_capture(&bin_path, &["--version"]) {
        result.version = Some(v_out.stdout.trim().to_string());
    }

    result
}

pub fn doctor(provider_id: &str, app: &AppHandle) -> AgentDoctorResult {
    let normalized = match provider_id {
        "claude-code" | "claude-acp" | "claude" => "claude-acp",
        "codex" | "codex-acp" => "codex-acp",
        "antigravity" | "antigravity-acp" | "gemini" | "agy" => "antigravity-acp",
        _ => provider_id,
    };

    match normalized {
        "claude-acp" => check_claude_doctor(app),
        "codex-acp" => check_codex_doctor(app),
        "antigravity-acp" => check_antigravity_doctor(app, empty_result()),
        _ => empty_result(),
    }
}
