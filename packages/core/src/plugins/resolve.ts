import {
  capabilitySummary,
  type NormalizedPlugin,
  type PluginCapabilities,
  type PluginComponentRef,
} from "./plugin.ts";

export type EnginePluginModel = "native" | "mcp-adapter" | "prompt-only";

export interface EnginePluginProfile {
  id: string;
  pluginModel: EnginePluginModel;
  mcp: boolean;
}

export interface ActivePluginRef {
  id: string;
  version: string;
  mode: "always" | "manual";
  enabledCapabilities?: string[];
}

export interface ActivationPlan {
  pluginId: string;
  version: string;
  contentHash: string;
  engineId: string;
  model: EnginePluginModel;
  mode: "always" | "manual";
  instructions: string[];
  mcpServers: unknown[];
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

interface SupportResolution {
  supported: PluginComponentRef[];
  unsupported: PluginComponentRef[];
  mcpServers: unknown[];
  nativeEnable: boolean;
}

function resolveSupport(plugin: NormalizedPlugin, engine: EnginePluginProfile): SupportResolution {
  const all = flatten(plugin.capabilities);
  const mcp = plugin.capabilities.mcpServers;
  const asMcpServers = (refs: PluginComponentRef[]) => refs.map((c) => ({ name: c.name }));

  switch (engine.pluginModel) {
    case "native":
      return { supported: all, unsupported: [], mcpServers: asMcpServers(mcp), nativeEnable: true };
    case "mcp-adapter":
      return {
        supported: all,
        unsupported: plugin.capabilities.hooks.concat(plugin.capabilities.lspServers),
        mcpServers: engine.mcp ? asMcpServers(mcp) : [],
        nativeEnable: false,
      };
    default:
      return {
        supported: plugin.capabilities.skills.concat(plugin.capabilities.agents),
        unsupported: all.filter((c) => c.kind !== "skill" && c.kind !== "agent"),
        mcpServers: [],
        nativeEnable: false,
      };
  }
}

export function planActivation(
  plugin: NormalizedPlugin,
  ref: ActivePluginRef,
  engine: EnginePluginProfile,
): ActivationPlan {
  const { supported, unsupported, mcpServers, nativeEnable } = resolveSupport(plugin, engine);

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
