export interface EngineCapabilities {
  streaming: boolean;
  toolCalls: boolean;
  fileEditing: boolean;
  permissions: boolean;
  resume: boolean;
  handoff: boolean;
  /** Accepts MCP servers on ACP `session/new` (`mcpServers`). */
  mcp: boolean;
}

/**
 * How an engine consumes a Weave plugin:
 *
 *   native       loads the plugin itself (Claude Code)
 *   mcp-adapter  can run the plugin's MCP servers; the rest is guidance text
 *   prompt-only  nothing executable — the plugin is described, not run
 */
export type EnginePluginModel = "native" | "mcp-adapter" | "prompt-only";

/**
 * What an engine actually reports about token spend. ACP makes both channels
 * optional and every adapter implements a different subset, so the UI reads
 * this to explain an absent figure instead of rendering a dead progress bar.
 */
export interface EngineTokenReporting {
  /** `session/update: usage_update` — live context-window used/size. */
  contextWindow: boolean;
  /** `PromptResponse.usage` — cumulative input / output / thought totals. */
  turnTotals: boolean;
  /** Cumulative session cost, carried on `usage_update`. */
  cost: boolean;
}

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
  /** How this engine consumes plugins. Unknown engines are prompt-only. */
  pluginModel: EnginePluginModel;
}

/** Reports the context window live, per-turn totals, and session cost. */
const FULL_TOKEN_REPORTING: EngineTokenReporting = {
  contextWindow: true,
  turnTotals: true,
  cost: true,
};

/** Reports nothing about tokens on either ACP channel. */
const NO_TOKEN_REPORTING: EngineTokenReporting = {
  contextWindow: false,
  turnTotals: false,
  cost: false,
};

const FULL_CAPABILITIES: EngineCapabilities = {
  streaming: true,
  toolCalls: true,
  fileEditing: true,
  permissions: true,
  resume: true,
  handoff: true,
  mcp: true,
};

/** Full ACP behaviour, but the engine cannot mount MCP servers. */
const NO_MCP_CAPABILITIES: EngineCapabilities = { ...FULL_CAPABILITIES, mcp: false };

export const ENGINES: Record<string, EngineDescriptor> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    packageName: "@agentclientprotocol/claude-agent-acp",
    binName: "claude-agent-acp",
    provider: "anthropic",
    install: "pnpm -F @weave/agent add @agentclientprotocol/claude-agent-acp",
    capabilities: FULL_CAPABILITIES,
    tokens: FULL_TOKEN_REPORTING,
    pluginModel: "native",
  },
  codex: {
    id: "codex",
    label: "Codex",
    packageName: "@agentclientprotocol/codex-acp",
    binName: "codex-acp",
    provider: "openai",
    install: "pnpm -F @weave/agent add @agentclientprotocol/codex-acp",
    capabilities: FULL_CAPABILITIES,
    tokens: FULL_TOKEN_REPORTING,
    pluginModel: "mcp-adapter",
  },
  amp: {
    id: "amp",
    label: "Amp",
    packageName: "@sourcegraph/amp",
    binName: "amp-acp",
    provider: "sourcegraph",
    install: "pnpm -F @weave/agent add @sourcegraph/amp",
    capabilities: NO_MCP_CAPABILITIES,
    // Amp streams no usage_update; cumulative totals arrive with the prompt
    // response when the adapter fills them in.
    tokens: { contextWindow: false, turnTotals: true, cost: false },
    pluginModel: "prompt-only",
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    packageName: "agy-acp",
    binName: "agy-acp",
    provider: "google",
    // agy-acp runs shell commands in its own sandbox (sandbox = true by
    // default), which denies things like `node -v` even after Berd's own
    // permission policy has approved the ACP request. `confineToTaskDir` is
    // already the real boundary — it confines every write to the project dir —
    // so this drops a redundant gate, not a necessary one.
    // TODO: gate this behind a per-project trust decision instead of always-on.
    args: ["--no-sandbox"],
    install: "pnpm -F @weave/agent add agy-acp",
    capabilities: NO_MCP_CAPABILITIES,
    tokens: NO_TOKEN_REPORTING,
    pluginModel: "prompt-only",
  },
};

// Convenience alias: 'agy' points to 'antigravity' without creating duplicate enumerable keys.
Object.defineProperty(ENGINES, "agy", {
  value: ENGINES.antigravity,
  enumerable: false,
  configurable: true,
  writable: true,
});

export const DEFAULT_ENGINE_ID = "antigravity";

/** What the given engine id is expected to report; unknown ids report nothing. */
export function tokenReportingFor(engineId: string | null | undefined) {
  if (!engineId) return NO_TOKEN_REPORTING;
  return ENGINES[engineId]?.tokens ?? NO_TOKEN_REPORTING;
}

/**
 * Compute CLI arguments for an engine run, factoring in sandboxing.
 *
 * For Antigravity: `agy-acp` defaults to its internal platform sandbox.
 * When `sandboxed` is true, omit `--no-sandbox` to lock shell execution down.
 * When false, keep `--no-sandbox` so general development commands run smoothly.
 */
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

