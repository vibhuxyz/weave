import { ENGINES, type EnginePluginModel } from "@weave/agent/browser";
import { type NormalizedPlugin } from "@weave/core/browser";

export function pluginModelFor(engineId: string | undefined): EnginePluginModel {
  return (engineId && ENGINES[engineId]?.pluginModel) || "prompt-only";
}

/**
 * Which engines a plugin fully works on, by its capabilities:
 *   universal  skills / agents only — guidance lands on every engine
 *   mcp        ships an MCP server — needs Claude Code or Codex for the tools
 *   claude     ships hooks or an LSP server — only Claude Code runs those
 */
export type PluginTier = "universal" | "mcp" | "claude";

export function pluginTier(plugin: NormalizedPlugin): PluginTier {
  const needsMCP = plugin.capabilities.mcpServers.length > 0;
  const needsClaude =
    plugin.capabilities.hooks.length > 0 ||
    plugin.capabilities.lspServers.length > 0;

  if (needsClaude) return "claude";
  if (needsMCP) return "mcp";
  return "universal";
}

export const TIER_META: Record<
  PluginTier,
  { label: string; description: string; hint: string }
> = {
  universal: {
    label: "Always",
    description: "Works on any engine",
    hint: "Every capability is active on this engine",
  },
  mcp: {
    label: "Local tools",
    description: "Requires Claude Code or Codex",
    hint: "This engine runs the MCP tools but drops Claude-only hooks",
  },
  claude: {
    label: "Hooks & LSP",
    description: "Requires Claude Code",
    hint: "This engine limits plugins to injecting context only (no tools)",
  },
};

/**
 * One line describing what the current engine will actually do with a plugin —
 * shown in the Plugins view and the context panel so "Always" is never
 * mistaken for "the tools are live".
 */
export function compatLine(
  plugin: NormalizedPlugin,
  engineId: string | undefined,
): string {
  const tier = pluginTier(plugin);
  const model = pluginModelFor(engineId);

  if (tier === "universal") return "Every capability is active on this engine";
  if (model === "prompt-only")
    return "This engine limits plugins to injecting context only (no tools)";
  if (model === "mcp-adapter" && tier === "claude")
    return "This engine runs the MCP tools but drops Claude-only hooks";
  return "Every capability is active on this engine";
}
