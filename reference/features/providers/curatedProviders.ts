import type { AcpProvider } from "@/shared/api/acp";
import type { ProviderCatalogEntry } from "@/shared/types/providers";

export const CURATED_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "goose",
    displayName: "Goose",
    category: "agent",
    description: "Block's open-source coding agent",
    setupMethod: "none",
    group: "default",
    aliases: ["goose"],
  },
  {
    id: "claude-acp",
    displayName: "Claude Code",
    category: "agent",
    description: "Anthropic's agentic coding tool",
    setupMethod: "cli_auth",
    binaryName: "claude-agent-acp",
    group: "default",
    aliases: ["claude-acp", "claude_code", "claude-code", "claude"],
    supportsInstall: true,
    supportsAuth: true,
    supportsAuthStatus: true,
    bundledBridge: true,
  },
  {
    id: "codex-acp",
    displayName: "Codex",
    category: "agent",
    description: "OpenAI's coding agent",
    setupMethod: "cli_auth",
    binaryName: "codex-acp",
    group: "default",
    aliases: ["codex-acp", "codex_cli", "codex-cli", "codex"],
    supportsInstall: true,
    supportsAuth: true,
    supportsAuthStatus: true,
    bundledBridge: true,
  },
  // This fork ships Claude Code + Codex only, with goose kept above as the
  // fallback that old sessions' persisted provider ids resolve against.
  // Copilot, Amp, and Cursor were removed here; see docs/system/FORK.md V1.
  // full pi support in a future update
  // {
  //   id: "pi-acp",
  //   displayName: "Pi",
  //   category: "agent",
  //   description: "Pi ACP agent",
  //   setupMethod: "cli_auth",
  //   binaryName: "pi-acp",
  //   group: "default",
  //   aliases: ["pi-acp", "pi"],
  //   supportsInstall: false,
  //   supportsAuth: false,
  //   supportsAuthStatus: false,
  //   supportsModelList: false,
  //   modelSelectionHint: "Use the Pi CLI to configure the model.",
  // },
  {
    id: "databricks_v2",
    displayName: "Databricks AI Gateway",
    category: "model",
    description: "Databricks AI Gateway models",
    setupMethod: "host_with_oauth_fallback",
    nativeConnectQuery: "databricks",
    group: "default",
    aliases: ["databricks_v2", "databricks", "databricks-ai-gateway"],
    supportsInstall: false,
    supportsAuth: false,
    supportsAuthStatus: false,
  },
];

export const CURATED_PROVIDER_CATALOG_BY_ID = new Map(
  CURATED_PROVIDER_CATALOG.map((provider) => [provider.id, provider]),
);

export function getCuratedAgentProviders(): AcpProvider[] {
  return CURATED_PROVIDER_CATALOG.filter(
    (provider) => provider.category === "agent",
  ).map((provider) => ({ id: provider.id, label: provider.displayName }));
}
