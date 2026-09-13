import { ENGINES, type EnginePluginModel } from "@weave/agent/engines-registry.ts";
import {
  capabilityCount,
  type NormalizedPlugin,
} from "@weave/core/plugins/plugin.ts";

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
  const c = plugin.capabilities;
  if (c.hooks.length > 0 || c.lspServers.length > 0) return "claude";
  if (c.mcpServers.length > 0) return "mcp";
  return "universal";
}

export const TIER_META: Record<
  PluginTier,
  { label: string; hint: string }
> = {
  universal: {
    label: "Works with every engine",
    hint: "Guidance the agent applies on Claude Code, Codex and Antigravity alike.",
  },
  mcp: {
    label: "Claude Code & Codex",
    hint: "Ships an MCP server — its tools run on engines that speak MCP.",
  },
  claude: {
    label: "Claude Code only",
    hint: "Uses hooks or an LSP server that only Claude Code can load.",
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
  engineLabel: string | undefined,
): string {
  const label = engineLabel ?? "this engine";
  const model = pluginModelFor(engineId);
  const hasMcp = plugin.capabilities.mcpServers.length > 0;
  const onlyGuidance = capabilityCount(plugin.capabilities) === 0;

  if (onlyGuidance) return `Guidance only on ${label}`;
  switch (model) {
    case "native":
      return `Runs natively on ${label} (V2)`;
    case "mcp-adapter":
      return hasMcp
        ? `MCP server adaptable on ${label} (V2); rest is guidance`
        : `Guidance only on ${label}`;
    default:
      return `Guidance only on ${label}`;
  }
}
