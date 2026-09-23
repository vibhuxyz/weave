use crate::agents::agent_process::run_capture;
use crate::agents::antigravity_doctor::check_antigravity_doctor;
use crate::agents::providers::{
    get_provider, resolve_provider_binary, AuthStrategy, CliAuthCommands, ProviderConfig,
};
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

fn check_cli_doctor(
    provider: &ProviderConfig,
    commands: CliAuthCommands,
    app: &AppHandle,
) -> AgentDoctorResult {
    let mut result = empty_result();
    let bin_path = match resolve_provider_binary(provider, app) {
        Some(p) => p,
        None => return result,
    };

    result.installed = true;

    if let Ok(out) = run_capture(&bin_path, commands.status_args) {
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
    let provider = match get_provider(provider_id) {
        Some(p) => p,
        None => return empty_result(),
    };

    match provider.auth {
        AuthStrategy::CliAuth(commands) => check_cli_doctor(provider, commands, app),
        AuthStrategy::AcpAuth => check_antigravity_doctor(provider, app, empty_result()),
    }
}
