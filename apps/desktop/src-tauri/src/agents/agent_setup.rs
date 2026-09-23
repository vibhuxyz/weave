use crate::agents::agent_doctor::{doctor, AgentDoctorResult};
use crate::agents::auth::acp::run_acp_auth;
use crate::agents::auth::cli::run_cli_login;
use crate::agents::providers::{
    get_provider, resolve_provider_binary, AuthStrategy, CliAuthCommands,
};
use serde_json::json;
use std::path::Path;
use tauri::{AppHandle, Emitter};

fn emit_setup_state(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("agent-setup:state", payload);
}

fn run_cli_auth_strategy(
    provider_id: &str,
    bin: &Path,
    commands: CliAuthCommands,
    app: &AppHandle,
) -> Result<(), String> {
    let res = run_cli_login(bin, commands.login_args)?;
    if res.success {
        return Ok(());
    }
    let error = res.error.unwrap_or_else(|| "Authentication failed".to_string());
    emit_setup_state(
        app,
        json!({ "state": "failed", "provider": provider_id, "error": error }),
    );
    Err("Authentication failed".to_string())
}

fn run_acp_auth_strategy(
    provider_id: &str,
    bin: &Path,
    method_id: Option<&str>,
    app: &AppHandle,
) -> Result<(), String> {
    let Some(method_id) = method_id else {
        return Err("An authentication method must be selected for this provider".to_string());
    };

    let res = run_acp_auth(bin, method_id)?;
    if res.success {
        return Ok(());
    }
    let error = res
        .error
        .unwrap_or_else(|| "ACP authentication failed".to_string());
    emit_setup_state(
        app,
        json!({ "state": "failed", "provider": provider_id, "error": error }),
    );
    Err("ACP authentication failed".to_string())
}

pub async fn setup_provider(
    app: AppHandle,
    provider_id: String,
    method_id: Option<String>,
) -> Result<AgentDoctorResult, String> {
    emit_setup_state(
        &app,
        json!({ "state": "checking", "provider": &provider_id }),
    );

    let initial = doctor(&provider_id, &app);
    if !initial.installed {
        emit_setup_state(
            &app,
            json!({
                "state": "not_installed",
                "provider": &provider_id,
                "error": "Agent binary is not installed"
            }),
        );
        return Err("Agent is not installed".to_string());
    }

    if initial.authenticated && initial.usable {
        emit_setup_state(
            &app,
            json!({
                "state": "authenticated",
                "provider": &provider_id,
                "capabilities": initial.capabilities
            }),
        );
        return Ok(initial);
    }

    if method_id.is_none() && !initial.auth_methods.is_empty() {
        emit_setup_state(
            &app,
            json!({
                "state": "auth_required",
                "provider": &provider_id,
                "methods": initial.auth_methods
            }),
        );
        return Ok(initial);
    }

    let provider = get_provider(&provider_id).ok_or("Unknown provider")?;
    let bin = resolve_provider_binary(provider, &app)
        .ok_or_else(|| format!("{} binary not found", provider.id))?;

    emit_setup_state(
        &app,
        json!({
            "state": "authenticating",
            "provider": &provider_id,
            "methodId": &method_id
        }),
    );

    match provider.auth {
        AuthStrategy::CliAuth(commands) => {
            run_cli_auth_strategy(&provider_id, &bin, commands, &app)?
        }
        AuthStrategy::AcpAuth => {
            run_acp_auth_strategy(&provider_id, &bin, method_id.as_deref(), &app)?
        }
    }

    let post_check = doctor(&provider_id, &app);
    if post_check.authenticated && post_check.usable {
        emit_setup_state(
            &app,
            json!({
                "state": "authenticated",
                "provider": &provider_id,
                "capabilities": post_check.capabilities
            }),
        );
        Ok(post_check)
    } else {
        emit_setup_state(
            &app,
            json!({
                "state": "failed",
                "provider": &provider_id,
                "error": "Authentication did not result in usable session"
            }),
        );
        Err("Authentication verification failed".to_string())
    }
}
