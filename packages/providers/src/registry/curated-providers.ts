import type { AgentProvider } from "./types.ts";

export const CURATED_PROVIDERS: readonly AgentProvider[] = [
  {
    id: "claude-acp",
    name: "Claude Code",
    runtime: {
      command: "claude-agent-acp",
      args: [],
    },
    auth: {
      type: "cli_auth",
      login: {
        command: "claude-agent-acp",
        args: ["--cli", "auth", "login"],
      },
      status: {
        command: "claude-agent-acp",
        args: ["--cli", "auth", "status"],
      },
    },
    capabilities: {
      models: true,
      reasoning: true,
      tools: true,
      sessions: true,
    },
  },
  {
    id: "codex-acp",
    name: "Codex",
    runtime: {
      command: "codex-acp",
      args: [],
    },
    auth: {
      type: "cli_auth",
      login: {
        command: "codex-acp",
        args: ["cli", "login"],
      },
      status: {
        command: "codex-acp",
        args: ["cli", "login", "status"],
      },
    },
    capabilities: {
      models: true,
      reasoning: true,
      tools: true,
      sessions: true,
    },
  },
  {
    id: "antigravity-acp",
    name: "Google Antigravity",
    runtime: {
      command: "agy_acp_server.par",
      args: [],
    },
    auth: {
      type: "acp_auth",
      server: {
        command: "agy_acp_server.par",
        args: [],
      },
      preferredMethodId: "oauth-personal",
    },
    capabilities: {
      models: true,
      reasoning: true,
      tools: true,
      sessions: true,
    },
  },
] as const;

export function findCuratedProvider(id: string): AgentProvider | undefined {
  const normalized = normalizeProviderId(id);
  return CURATED_PROVIDERS.find((p) => p.id === normalized);
}

export function normalizeProviderId(id: string): string {
  if (id === "claude-code" || id === "claude" || id === "claude-acp") {
    return "claude-acp";
  }
  if (id === "codex" || id === "codex-acp") {
    return "codex-acp";
  }
  if (id === "antigravity" || id === "gemini" || id === "agy" || id === "antigravity-acp") {
    return "antigravity-acp";
  }
  return id;
}
