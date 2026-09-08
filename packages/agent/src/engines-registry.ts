export interface EngineCapabilities {
  streaming: boolean;
  toolCalls: boolean;
  fileEditing: boolean;
  permissions: boolean;
  resume: boolean;
  handoff: boolean;
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
}

const FULL_CAPABILITIES: EngineCapabilities = {
  streaming: true,
  toolCalls: true,
  fileEditing: true,
  permissions: true,
  resume: true,
  handoff: true,
};

export const ENGINES: Record<string, EngineDescriptor> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    packageName: "@agentclientprotocol/claude-agent-acp",
    binName: "claude-agent-acp",
    provider: "anthropic",
    install: "pnpm -F @weave/agent add @agentclientprotocol/claude-agent-acp",
    capabilities: FULL_CAPABILITIES,
  },
  codex: {
    id: "codex",
    label: "Codex",
    packageName: "@agentclientprotocol/codex-acp",
    binName: "codex-acp",
    provider: "openai",
    install: "pnpm -F @weave/agent add @agentclientprotocol/codex-acp",
    capabilities: FULL_CAPABILITIES,
  },
  amp: {
    id: "amp",
    label: "Amp",
    packageName: "@sourcegraph/amp",
    binName: "amp-acp",
    provider: "sourcegraph",
    install: "pnpm -F @weave/agent add @sourcegraph/amp",
    capabilities: FULL_CAPABILITIES,
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
    capabilities: FULL_CAPABILITIES,
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

