use crate::agents::agent_spawn::spawn_agent_process;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;

pub struct AcpAuthResult {
    pub success: bool,
    pub methods: Vec<Value>,
    pub error: Option<String>,
}

fn send_jsonrpc_request(
    stdin: &mut std::process::ChildStdin,
    id: u64,
    method: &str,
    params: Value,
) -> Result<(), String> {
    let req = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });
    let raw = req.to_string();
    writeln!(stdin, "{}", raw).map_err(|e| format!("Failed to write to ACP stdin: {}", e))?;
    stdin
        .flush()
        .map_err(|e| format!("Failed to flush ACP stdin: {}", e))?;
    Ok(())
}

fn read_jsonrpc_response(
    reader: &mut BufReader<std::process::ChildStdout>,
    expected_id: u64,
) -> Result<Value, String> {
    let mut line = String::new();
    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|e| format!("Read failed: {}", e))?;
        if bytes == 0 {
            return Err("ACP process closed stdout unexpectedly".to_string());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
            if parsed.get("id").and_then(|v| v.as_u64()) == Some(expected_id) {
                return Ok(parsed);
            }
        }
    }
}

pub fn run_acp_auth(program: &Path, method_id: &str) -> Result<AcpAuthResult, String> {
    let mut child = spawn_agent_process(program, &[], true, true)?;
    let mut stdin = child.stdin.take().ok_or("No child stdin")?;
    let stdout = child.stdout.take().ok_or("No child stdout")?;
    let mut reader = BufReader::new(stdout);

    let init_params = json!({
        "protocolVersion": 1,
        "clientInfo": {
            "name": "Weave",
            "version": "0.1.0"
        },
        "capabilities": {}
    });

    send_jsonrpc_request(&mut stdin, 1, "initialize", init_params)?;
    let init_resp = read_jsonrpc_response(&mut reader, 1)?;

    let methods = init_resp
        .pointer("/result/authMethods")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let auth_params = json!({
        "methodId": method_id
    });
    send_jsonrpc_request(&mut stdin, 2, "authenticate", auth_params)?;
    let auth_resp = read_jsonrpc_response(&mut reader, 2)?;

    let has_error = auth_resp.get("error").is_some();
    let err_msg = auth_resp
        .pointer("/error/message")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let _ = child.kill();
    let _ = child.wait();

    Ok(AcpAuthResult {
        success: !has_error,
        methods,
        error: err_msg,
    })
}
