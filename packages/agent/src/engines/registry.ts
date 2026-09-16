import {
  type EngineCapabilities,
  type EngineTokenReporting,
  FULL_TOKEN_REPORTING,
  NO_TOKEN_REPORTING,
  CLAUDE_CODE_CAPABILITIES,
  CODEX_CAPABILITIES,
  AMP_CAPABILITIES,
  ANTIGRAVITY_CAPABILITIES,
} from "./engine-capabilities.ts";

export type {
  EngineCapabilities,
  EngineTokenReporting,
} from "./engine-capabilities.ts";
export {
  FULL_TOKEN_REPORTING,
  NO_TOKEN_REPORTING,
  CLAUDE_CODE_CAPABILITIES,
  CODEX_CAPABILITIES,
  AMP_CAPABILITIES,
  ANTIGRAVITY_CAPABILITIES,
} from "./engine-capabilities.ts";

export type EnginePluginModel = "native" | "mcp-adapter" | "prompt-only";

export interface EngineDescriptor {
  id: string;
  label: string;
  packageName: string;
  binName: string;
  provider: string;
  model?: string;
  args?: string[];
  env?: Record<string, string>;
  install?: string;
  capabilities: EngineCapabilities;
  tokens: EngineTokenReporting;
  pluginModel: EnginePluginModel;
}

export const ENGINES: Record<string, EngineDescriptor> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    packageName: "@agentclientprotocol/claude-agent-acp",
    binName: "claude-agent-acp",
    provider: "anthropic",
    install: "bun add @agentclientprotocol/claude-agent-acp --filter @weave/agent",
    capabilities: CLAUDE_CODE_CAPABILITIES,
    tokens: FULL_TOKEN_REPORTING,
    pluginModel: "native",
  },
  codex: {
    id: "codex",
    label: "Codex",
    packageName: "@agentclientprotocol/codex-acp",
    binName: "codex-acp",
    provider: "openai",
    install: "bun add @agentclientprotocol/codex-acp --filter @weave/agent",
    capabilities: CODEX_CAPABILITIES,
    tokens: FULL_TOKEN_REPORTING,
    pluginModel: "mcp-adapter",
  },
  amp: {
    id: "amp",
    label: "Amp",
    packageName: "@sourcegraph/amp",
    binName: "amp-acp",
    provider: "sourcegraph",
    install: "bun add @sourcegraph/amp --filter @weave/agent",
    capabilities: AMP_CAPABILITIES,
    tokens: { contextWindow: false, turnTotals: true, cost: false },
    pluginModel: "prompt-only",
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    packageName: "agy-acp",
    binName: "agy-acp",
    provider: "google",
    args: ["--no-sandbox"],
    install: "bun add agy-acp --filter @weave/agent",
    capabilities: ANTIGRAVITY_CAPABILITIES,
    tokens: NO_TOKEN_REPORTING,
    pluginModel: "prompt-only",
  },
};

Object.defineProperty(ENGINES, "agy", {
  value: ENGINES.antigravity,
  enumerable: false,
  configurable: true,
  writable: true,
});

export const DEFAULT_ENGINE_ID = "antigravity";

export function tokenReportingFor(engineId: string | null | undefined) {
  if (!engineId) return NO_TOKEN_REPORTING;
  return ENGINES[engineId]?.tokens ?? NO_TOKEN_REPORTING;
}

export function resolveEngineArgs(
  engine: EngineDescriptor,
  options?: { sandboxed?: boolean },
): string[] {
  const base = engine.args ?? [];
  if (engine.id === "antigravity" || engine.id === "agy") {
    if (options?.sandboxed) {
      return base.filter((arg) => arg !== "--no-sandbox");
    }
    return base.includes("--no-sandbox") ? base : [...base, "--no-sandbox"];
  }
  return [...base];
}
