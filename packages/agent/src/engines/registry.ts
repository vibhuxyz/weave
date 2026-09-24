import type {
  EngineDescriptor,
  EngineCapabilities,
  EngineTokenReporting,
  EnginePluginModel,
} from "./types.ts";
import {
  FULL_TOKEN_REPORTING,
  NO_TOKEN_REPORTING,
  CLAUDE_CODE_CAPABILITIES,
  CODEX_CAPABILITIES,
  AMP_CAPABILITIES,
  ANTIGRAVITY_CAPABILITIES,
  GEMINI_CAPABILITIES,
  OPENCODE_CAPABILITIES,
} from "./capabilities.ts";

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
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    packageName: "@google/gemini-cli",
    binName: "gemini",
    provider: "google",
    args: ["--acp"],
    install: "bun add @google/gemini-cli --filter @weave/agent",
    capabilities: GEMINI_CAPABILITIES,
    tokens: NO_TOKEN_REPORTING,
    pluginModel: "mcp-adapter",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    packageName: "opencode-ai",
    binName: "opencode",
    provider: "sst",
    runtime: "native",
    args: ["acp"],
    install: "bun add opencode-ai --filter @weave/agent (its postinstall fetches the native binary, so it must be allowed to run)",
    capabilities: OPENCODE_CAPABILITIES,
    tokens: NO_TOKEN_REPORTING,
    pluginModel: "mcp-adapter",
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
    terminalAuth: {
      transport: "pty",
      promptAnswers: [{ whenOutputIncludes: "Select login method", input: "\r" }],
    },
    setup: {
      command: "agy",
      completedWhenExists: ".gemini/antigravity-cli/settings.json",
      description:
        "Antigravity's CLI runs a one-time setup wizard before it will do any work. Weave answers the cosmetic pages; the data-sharing page is left for you, because that one is your decision.",
    },
  },
};

Object.defineProperty(ENGINES, "agy", {
  value: ENGINES.antigravity,
  enumerable: false,
});

/**
 * Claude Code, not Antigravity. Both bridges speak ACP, but agy-acp answers
 * permission prompts by typing into agy's terminal UI, and that keystroke does
 * not land — every command stalls at `pending` while agy logs "resolved by
 * another client". claude-agent-acp and codex-acp answer over the protocol and
 * have no such bridge. Antigravity stays selectable; it is just not the
 * default a new install lands on.
 */
export const DEFAULT_ENGINE_ID = "claude-code";

export function tokenReportingFor(engineId: string | null | undefined): EngineTokenReporting {
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
  }
  return [...base];
}
