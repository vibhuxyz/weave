use crate::agents::agent_doctor::{AgentDoctorResult, AuthMethodInfo};
use crate::agents::agent_spawn::spawn_agent_process;
use crate::agents::auth::acp::{read_jsonrpc_response, send_jsonrpc_request};
use crate::agents::providers::{resolve_provider_binary, ProviderConfig};
use serde_json::{json, Value};
use std::io::BufReader;
use std::process::{ChildStdin, ChildStdout};
use tauri::AppHandle;

fn parse_init_methods(parsed: &Value) -> Vec<AuthMethodInfo> {
    let methods = match parsed
        .pointer("/result/authMethods")
        .and_then(|v| v.as_array())
    {
        Some(m) => m,
        None => return Vec::new(),
    };
    methods
        .iter()
        .filter_map(|m| {
            Some(AuthMethodInfo {
                id: m.get("id")?.as_str()?.to_string(),
                name: m.get("name")?.as_str()?.to_string(),
                description: m
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            })
        })
        .collect()
}

fn probe_initialize(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    result: &mut AgentDoctorResult,
) -> Result<(), String> {
    let init_params = json!({
        "protocolVersion": 1,
        "clientInfo": { "name": "Weave", "version": "0.1.0" },
        "capabilities": {}
    });
    send_jsonrpc_request(stdin, 1, "initialize", init_params)?;
    let parsed = read_jsonrpc_response(reader, 1)?;

    result.auth_methods = parse_init_methods(&parsed);
    if let Some(version) = parsed
        .pointer("/result/agentInfo/version")
        .and_then(|v| v.as_str())
    {
        result.version = Some(version.to_string());
    }
    Ok(())
}

fn probe_authenticate(
    stdin: &mut ChildStdin,
    reader: &mut BufReader<ChildStdout>,
    result: &mut AgentDoctorResult,
) -> Result<(), String> {
    let Some(method) = result.auth_methods.first() else {
        result.authenticated = true;
        result.usable = true;
        return Ok(());
    };
    send_jsonrpc_request(stdin, 2, "authenticate", json!({ "methodId": method.id }))?;
    let parsed = read_jsonrpc_response(reader, 2)?;

    if parsed.get("result").is_some() {
        result.authenticated = true;
        result.usable = true;
    }
    Ok(())
}

pub fn check_antigravity_doctor(
    provider: &ProviderConfig,
    app: &AppHandle,
    base_result: AgentDoctorResult,
) -> AgentDoctorResult {
    let mut result = base_result;
    let Some(bin_path) = resolve_provider_binary(provider, app) else {
        return result;
    };

    result.installed = true;
    let mut child = match spawn_agent_process(&bin_path, &[], true, true) {
        Ok(c) => c,
        Err(e) => {
            result.error = Some(e);
            return result;
        }
    };

    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        let _ = child.kill();
        return result;
    };
    let mut reader = BufReader::new(stdout);

    if probe_initialize(&mut stdin, &mut reader, &mut result).is_ok() {
        let _ = probe_authenticate(&mut stdin, &mut reader, &mut result);
    }

    let _ = child.kill();
    let _ = child.wait();
    result
}
