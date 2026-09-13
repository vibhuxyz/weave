/**
 * The normalized plugin model. A "plugin" in Weave is engine-agnostic: it is a
 * bundle of capabilities (commands, skills, agents, MCP servers, hooks, LSP
 * servers) plus metadata. What a given engine can actually do with it is
 * decided later by the capability resolver (`resolve.ts`), not here.
 *
 * Discovery (does it exist?), installation (is it on disk?), activation (is it
 * on for this project?) and capability exposure (what does the engine get?) are
 * deliberately separate concerns and separate fields.
 */

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

/** Total component count across every kind. */
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

/** A short human summary, e.g. "3 skills · 1 MCP server · 2 commands". */
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
  /** Stable identity: "name@marketplace". */
  id: string;
  name: string;
  description: string;
  marketplace: string;
  /** Catalog version string — pinned into the ledger when activated. */
  version: string;
  /** Content hash (catalog `sha`) — reproducibility, distinct from `version`. */
  contentHash: string;
  author?: string;
  category?: string;
  homepage?: string;
  /** Unique installs reported by the marketplace, when known. */
  installs?: number;
  lastUpdated?: string;
  source?: PluginSource;
  capabilities: PluginCapabilities;
  /** Which catalog provider surfaced this plugin (e.g. "claude-catalog"). */
  provider: string;
  /** Present in the local install store — distinct from "activated". */
  installed: boolean;
  /** Context-window cost, when the catalog reports it. */
  tokenCost?: { alwaysOn: number; onInvoke: number };
}
