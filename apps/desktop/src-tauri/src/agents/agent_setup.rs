use crate::agents::agent_doctor::{doctor, AgentDoctorResult};
use crate::agents::agent_spawn::resolve_binary;
use crate::agents::auth::acp::run_acp_auth;
use crate::agents::auth::cli::run_cli_login;
use serde_json::json;
use tauri::{AppHandle, Emitter};

fn emit_setup_state(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("agent-setup:state", payload);
}

pub async fn setup_provider(
    app: AppHandle,
    provider_id: String,
    method_id: Option<String>,
) -> Result<AgentDoctorResult, String> {
    emit_setup_state(
        &app,
        json!({
            "state": "checking",
            "provider": &provider_id
        }),
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

    emit_setup_state(
        &app,
        json!({
            "state": "authenticating",
            "provider": &provider_id,
            "methodId": &method_id
        }),
    );

    let normalized = match provider_id.as_str() {
        "claude-code" | "claude-acp" | "claude" => "claude-acp",
        "codex" | "codex-acp" => "codex-acp",
        "antigravity" | "antigravity-acp" | "gemini" | "agy" => "antigravity-acp",
        _ => &provider_id,
    };

    match normalized {
        "claude-acp" => {
            let bin = resolve_binary("claude-agent-acp", &app)
                .or_else(|| resolve_binary("claude", &app))
                .ok_or("claude binary not found")?;
            let res = run_cli_login(&bin, &["auth", "login"])
                .or_else(|_| run_cli_login(&bin, &["--cli", "auth", "login"]))?;
            if !res.success {
                emit_setup_state(
                    &app,
                    json!({
                        "state": "failed",
                        "provider": &provider_id,
                        "error": res.error.unwrap_or_else(|| "Authentication failed".to_string())
                    }),
                );
                return Err("Authentication failed".to_string());
            }
        }
        "codex-acp" => {
            let bin = resolve_binary("codex-acp", &app)
                .or_else(|| resolve_binary("codex", &app))
                .ok_or("codex binary not found")?;
            let res = run_cli_login(&bin, &["cli", "login"])
                .or_else(|_| run_cli_login(&bin, &["login"]))?;
            if !res.success {
                emit_setup_state(
                    &app,
                    json!({
                        "state": "failed",
                        "provider": &provider_id,
                        "error": res.error.unwrap_or_else(|| "Authentication failed".to_string())
                    }),
                );
                return Err("Authentication failed".to_string());
            }
        }
        "antigravity-acp" => {
            let bin = resolve_binary("agy_acp_server.par", &app)
                .or_else(|| resolve_binary("agy-acp", &app))
                .or_else(|| resolve_binary("agy", &app))
                .ok_or("antigravity binary not found")?;
            let chosen_method = method_id.as_deref().unwrap_or("oauth-personal");
            let res = run_acp_auth(&bin, chosen_method)?;
            if !res.success {
                emit_setup_state(
                    &app,
                    json!({
                        "state": "failed",
                        "provider": &provider_id,
                        "error": res.error.unwrap_or_else(|| "ACP authentication failed".to_string())
                    }),
                );
                return Err("ACP authentication failed".to_string());
            }
        }
        _ => return Err("Unknown provider".to_string()),
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
