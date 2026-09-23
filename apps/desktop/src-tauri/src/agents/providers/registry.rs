use super::types::{AuthStrategy, CliAuthCommands, ProviderConfig};
use crate::agents::agent_spawn::resolve_binary;
use std::path::PathBuf;
use tauri::AppHandle;

// Only the ACP bridge counts as installed. The vendor CLIs (`claude`, `codex`)
// are different programs: finding one made Weave report the harness present and
// then run bridge-only arguments against it, which fails as
// `unknown option '--cli'` and surfaces as "Authentication failed".
const PROVIDERS: &[ProviderConfig] = &[
    ProviderConfig {
        id: "claude-acp",
        aliases: &["claude-code", "claude"],
        binary_candidates: &["claude-agent-acp"],
        auth: AuthStrategy::CliAuth(CliAuthCommands {
            login_args: &["--cli", "auth", "login"],
            status_args: &["--cli", "auth", "status"],
        }),
    },
    ProviderConfig {
        id: "codex-acp",
        aliases: &["codex"],
        binary_candidates: &["codex-acp"],
        auth: AuthStrategy::CliAuth(CliAuthCommands {
            login_args: &["cli", "login"],
            status_args: &["cli", "login", "status"],
        }),
    },
    ProviderConfig {
        id: "antigravity-acp",
        aliases: &["antigravity", "gemini", "agy"],
        binary_candidates: &["agy-acp"],
        auth: AuthStrategy::AcpAuth,
    },
];

pub fn get_provider(provider_id: &str) -> Option<&'static ProviderConfig> {
    PROVIDERS
        .iter()
        .find(|provider| provider.id == provider_id || provider.aliases.contains(&provider_id))
}

pub fn all_provider_ids() -> impl Iterator<Item = &'static str> {
    PROVIDERS.iter().map(|provider| provider.id)
}

pub fn resolve_provider_binary(provider: &ProviderConfig, app: &AppHandle) -> Option<PathBuf> {
    provider
        .binary_candidates
        .iter()
        .find_map(|name| resolve_binary(name, app))
}
