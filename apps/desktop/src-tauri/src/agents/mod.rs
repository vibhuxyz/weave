pub mod agent_doctor;
pub mod agent_process;
pub mod agent_setup;
pub mod agent_spawn;
pub mod antigravity_doctor;
pub mod auth;

use agent_doctor::{doctor, AgentDoctorResult};
use agent_setup::setup_provider;
use serde_json::json;
use tauri::AppHandle;

#[tauri::command]
pub fn doctor_provider(app: AppHandle, provider_id: String) -> Result<AgentDoctorResult, String> {
    Ok(doctor(&provider_id, &app))
}

#[tauri::command]
pub async fn setup_provider_command(
    app: AppHandle,
    provider_id: String,
    method_id: Option<String>,
) -> Result<AgentDoctorResult, String> {
    setup_provider(app, provider_id, method_id).await
}

#[tauri::command]
pub fn list_providers_command(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let providers = vec!["claude-acp", "codex-acp", "antigravity-acp"];
    let mut list = Vec::new();
    for id in providers {
        let doc = doctor(id, &app);
        list.push(json!({
            "providerId": id,
            "installed": doc.installed,
            "authenticated": doc.authenticated,
            "usable": doc.usable,
            "version": doc.version,
            "authMethods": doc.auth_methods,
            "capabilities": doc.capabilities,
            "error": doc.error
        }));
    }
    Ok(list)
}
