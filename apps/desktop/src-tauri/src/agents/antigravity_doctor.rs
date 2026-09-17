use crate::agents::agent_doctor::{AgentDoctorResult, AuthMethodInfo};
use crate::agents::agent_spawn::{resolve_binary, spawn_agent_process};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
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

pub fn check_antigravity_doctor(
    app: &AppHandle,
    base_result: AgentDoctorResult,
) -> AgentDoctorResult {
    let mut result = base_result;
    let bin = resolve_binary("agy_acp_server.par", app)
        .or_else(|| resolve_binary("antigravity-acp", app))
        .or_else(|| resolve_binary("agy-acp", app))
        .or_else(|| resolve_binary("agy", app));

    let bin_path = match bin {
        Some(p) => p,
        None => return result,
    };

    result.installed = true;
    let mut child = match spawn_agent_process(&bin_path, &[], true, true) {
        Ok(c) => c,
        Err(e) => {
            result.error = Some(e);
            return result;
        }
    };

    let mut stdin = match child.stdin.take() {
        Some(s) => s,
        None => return result,
    };
    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => return result,
    };
    let mut reader = BufReader::new(stdout);

    let init_req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": 1,
            "clientInfo": { "name": "Weave", "version": "0.1.0" },
            "capabilities": {}
        }
    });

    if writeln!(stdin, "{}", init_req.to_string()).is_err() || stdin.flush().is_err() {
        let _ = child.kill();
        return result;
    }

    let mut line = String::new();
    while let Ok(bytes) = reader.read_line(&mut line) {
        if bytes == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.starts_with('{') {
            if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                if parsed.get("id").and_then(|v| v.as_u64()) == Some(1) {
                    result.auth_methods = parse_init_methods(&parsed);
                    if let Some(ver) = parsed
                        .pointer("/result/agentInfo/version")
                        .and_then(|v| v.as_str())
                    {
                        result.version = Some(ver.to_string());
                    }
                    break;
                }
            }
        }
        line.clear();
    }

    let list_req = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "session/list",
        "params": {}
    });

    if writeln!(stdin, "{}", list_req.to_string()).is_ok() && stdin.flush().is_ok() {
        line.clear();
        while let Ok(bytes) = reader.read_line(&mut line) {
            if bytes == 0 {
                break;
            }
            let trimmed = line.trim();
            if trimmed.starts_with('{') {
                if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                    if parsed.get("id").and_then(|v| v.as_u64()) == Some(2) {
                        if parsed.get("result").is_some() {
                            result.authenticated = true;
                            result.usable = true;
                        }
                        break;
                    }
                }
            }
            line.clear();
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    result
}
