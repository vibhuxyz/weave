pub mod agent_doctor;
pub mod agent_env;
pub mod agent_process;
pub mod agent_setup;
pub mod agent_spawn;
pub mod antigravity_doctor;
pub mod auth;
pub mod providers;

use agent_doctor::{doctor, AgentDoctorResult};
use agent_setup::setup_provider;
use providers::all_provider_ids;
use serde_json::json;
use tauri::AppHandle;

async fn doctor_in_background(provider_id: String, app: AppHandle) -> Result<AgentDoctorResult, String> {
    let checked_id = provider_id.clone();
    tauri::async_runtime::spawn_blocking(move || doctor(&provider_id, &app))
        .await
        .map_err(|error| format!("Provider check for {checked_id} did not finish: {error}"))
}

fn provider_report(provider_id: &str, doc: AgentDoctorResult) -> serde_json::Value {
    json!({
        "providerId": provider_id,
        "installed": doc.installed,
        "authenticated": doc.authenticated,
        "usable": doc.usable,
        "version": doc.version,
        "authMethods": doc.auth_methods,
        "capabilities": doc.capabilities,
        "error": doc.error
    })
}

#[tauri::command]
pub async fn doctor_provider(app: AppHandle, provider_id: String) -> Result<AgentDoctorResult, String> {
    doctor_in_background(provider_id, app).await
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
pub async fn list_providers_command(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let checks: Vec<_> = all_provider_ids()
        .map(|id| (id, tauri::async_runtime::spawn(doctor_in_background(id.to_string(), app.clone()))))
        .collect();

    let mut reports = Vec::with_capacity(checks.len());
    for (id, check) in checks {
        let doc = check
            .await
            .map_err(|error| format!("Provider check for {id} did not finish: {error}"))??;
        reports.push(provider_report(id, doc));
    }
    Ok(reports)
}
