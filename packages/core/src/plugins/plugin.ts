export type PluginCapabilityKind =
  | "command"
  | "skill"
  | "agent"
  | "mcpServer"
  | "hook"
  | "lspServer";

export interface PluginComponentRef {
  name: string;
  kind: PluginCapabilityKind;
}

export interface PluginCapabilities {
  commands: PluginComponentRef[];
  skills: PluginComponentRef[];
  agents: PluginComponentRef[];
  mcpServers: PluginComponentRef[];
  hooks: PluginComponentRef[];
  lspServers: PluginComponentRef[];
}

export function emptyCapabilities(): PluginCapabilities {
  return {
    commands: [],
    skills: [],
    agents: [],
    mcpServers: [],
    hooks: [],
    lspServers: [],
  };
}

export function capabilityCount(caps: PluginCapabilities): number {
  return (
    caps.commands.length +
    caps.skills.length +
    caps.agents.length +
    caps.mcpServers.length +
    caps.hooks.length +
    caps.lspServers.length
  );
}

export function capabilitySummary(caps: PluginCapabilities): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n === 1) parts.push(`1 ${one}`);
    else if (n > 1) parts.push(`${n} ${many}`);
  };
  add(caps.skills.length, "skill", "skills");
  add(caps.mcpServers.length, "MCP server", "MCP servers");
  add(caps.commands.length, "command", "commands");
  add(caps.agents.length, "agent", "agents");
  add(caps.hooks.length, "hook", "hooks");
  add(caps.lspServers.length, "LSP server", "LSP servers");
  return parts.join(" · ");
}

export interface PluginSource {
  url?: string;
  path?: string;
  ref?: string;
  sha?: string;
}

export interface NormalizedPlugin {
  id: string;
  name: string;
  description: string;
  marketplace: string;
  version: string;
  contentHash: string;
  author?: string;
  category?: string;
  homepage?: string;
  installs?: number;
  lastUpdated?: string;
  source?: PluginSource;
  capabilities: PluginCapabilities;
  provider: string;
  installed: boolean;
  tokenCost?: { alwaysOn: number; onInvoke: number };
}
