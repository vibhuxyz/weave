import {
  capabilitySummary,
  type NormalizedPlugin,
  type PluginCapabilities,
  type PluginComponentRef,
} from "./plugin.ts";

/**
 * How an engine consumes a plugin:
 *
 *   native       the engine loads the plugin itself (Claude Code)
 *   mcp-adapter  the engine can run the plugin's MCP servers; the rest is prose
 *   prompt-only  nothing is executable — the plugin is described, not run
 *
 * V1 wires only the `instructions` and `unsupportedCapabilities` outputs of the
 * plan. `mcpServers` / `nativeEnable` are computed but not yet consumed (V2).
 */
export type EnginePluginModel = "native" | "mcp-adapter" | "prompt-only";

export interface EnginePluginProfile {
  id: string;
  pluginModel: EnginePluginModel;
  /** From `EngineCapabilities.mcp`. */
  mcp: boolean;
}

/** What the client sends per prompt: the plugins active for this turn. */
export interface ActivePluginRef {
  id: string;
  version: string;
  mode: "always" | "manual";
  /** Reserved: undefined = every applicable capability. */
  enabledCapabilities?: string[];
}

export interface ActivationPlan {
  pluginId: string;
  version: string;
  contentHash: string;
  engineId: string;
  model: EnginePluginModel;
  mode: "always" | "manual";
  /** V1: folded into the `<enabled-plugins>` system-prompt block. */
  instructions: string[];
  /** V2: passed to ACP `session/new` `mcpServers`. */
  mcpServers: unknown[];
  /** V2: written to `~/.claude/settings.json` `enabledPlugins`. */
  nativeEnable: boolean;
  activatedCapabilities: string[];
  unsupportedCapabilities: PluginComponentRef[];
}

const ALL_KINDS: (keyof PluginCapabilities)[] = [
  "commands",
  "skills",
  "agents",
  "mcpServers",
  "hooks",
  "lspServers",
];

function flatten(caps: PluginCapabilities): PluginComponentRef[] {
  return ALL_KINDS.flatMap((k) => caps[k]);
}

/**
 * Resolve one plugin against one engine into an activation plan. Pure — the
 * caller owns catalog lookup, the ledger, and (V2) actually applying the plan.
 */
export function planActivation(
  plugin: NormalizedPlugin,
  ref: ActivePluginRef,
  engine: EnginePluginProfile,
): ActivationPlan {
  const all = flatten(plugin.capabilities);
  const mcp = plugin.capabilities.mcpServers;

  let supported: PluginComponentRef[];
  let unsupported: PluginComponentRef[];
  let mcpServers: unknown[] = [];
  let nativeEnable = false;

  switch (engine.pluginModel) {
    case "native":
      supported = all;
      unsupported = [];
      nativeEnable = true;
      mcpServers = mcp.map((c) => ({ name: c.name }));
      break;
    case "mcp-adapter":
      supported = all;
      unsupported = plugin.capabilities.hooks.concat(plugin.capabilities.lspServers);
      mcpServers = engine.mcp ? mcp.map((c) => ({ name: c.name })) : [];
      break;
    default:
      supported = plugin.capabilities.skills.concat(plugin.capabilities.agents);
      unsupported = all.filter((c) => c.kind !== "skill" && c.kind !== "agent");
      break;
  }

  return {
    pluginId: plugin.id,
    version: ref.version || plugin.version,
    contentHash: plugin.contentHash,
    engineId: engine.id,
    model: engine.pluginModel,
    mode: ref.mode,
    instructions: buildInstructions(plugin, engine, unsupported),
    mcpServers,
    nativeEnable,
    activatedCapabilities: supported.map((c) => `${c.kind}:${c.name}`),
    unsupportedCapabilities: unsupported,
  };
}

function buildInstructions(
  plugin: NormalizedPlugin,
  engine: EnginePluginProfile,
  unsupported: PluginComponentRef[],
): string[] {
  const lines = [`- ${plugin.name}: ${plugin.description}`];
  const summary = capabilitySummary(plugin.capabilities);
  if (summary) lines.push(`  Provides: ${summary}`);
  if (plugin.homepage) lines.push(`  Source: ${plugin.homepage}`);
  if (engine.pluginModel !== "native" && unsupported.length > 0) {
    const names = unsupported.map((c) => `${c.name} (${c.kind})`).join(", ");
    lines.push(
      `  Not executable on ${engine.id}: ${names}. Follow the guidance above; do not assume these tools are available.`,
    );
  }
  return lines;
}

/** The `<enabled-plugins>` block, or undefined when nothing is active. */
export function formatActivationPlansSystemPrompt(
  plans: ActivationPlan[],
): string | undefined {
  if (plans.length === 0) return undefined;
  const body = plans.map((p) => p.instructions.join("\n")).join("\n");
  return [
    "<enabled-plugins>",
    "The user enabled these plugins for this conversation. Apply their guidance",
    "where it is relevant to the task in front of you.",
    "",
    body,
    "</enabled-plugins>",
  ].join("\n");
}
