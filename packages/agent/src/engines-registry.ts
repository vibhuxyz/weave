export interface AcpEngine {
  id: string;
  label: string;
  packageName: string;
  binName: string;
  args?: string[];
  env?: Record<string, string>;
  install?: string;
}

export const ENGINES: Record<string, AcpEngine> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    packageName: "@agentclientprotocol/claude-agent-acp",
    binName: "claude-agent-acp",
    install: "pnpm -F @weave/agent add @agentclientprotocol/claude-agent-acp",
  },
  codex: {
    id: "codex",
    label: "Codex",
    packageName: "@agentclientprotocol/codex-acp",
    binName: "codex-acp",
    install: "pnpm -F @weave/agent add @agentclientprotocol/codex-acp",
  },
  amp: {
    id: "amp",
    label: "Amp",
    packageName: "@sourcegraph/amp",
    binName: "amp-acp",
    install: "pnpm -F @weave/agent add @sourcegraph/amp",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    packageName: "@google/gemini-cli",
    binName: "gemini",
    args: ["--experimental-acp"],
    install: "pnpm -F @weave/agent add @google/gemini-cli",
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    packageName: "agy-acp",
    binName: "agy-acp",
    install: "pnpm -F @weave/agent add agy-acp",
  },
};

export const DEFAULT_ENGINE_ID = "antigravity";
