export interface EngineCapabilities {
  streaming: boolean;
  toolCalls: boolean;
  fileEditing: boolean;
  permissions: boolean;
  resume: boolean;
  handoff: boolean;
  mcp: boolean;
  planning: boolean;
  subagents: boolean;
  skills: boolean;
  sandbox: boolean;
  browser: boolean;
  computerUse: boolean;
}

export interface EngineTokenReporting {
  contextWindow: boolean;
  turnTotals: boolean;
  cost: boolean;
}

export type EnginePluginModel = "native" | "mcp-adapter" | "prompt-only";

export interface EngineDescriptor {
  id: string;
  label: string;
  packageName: string;
  binName: string;
  provider: string;
  args?: string[];
  env?: Record<string, string>;
  install?: string;
  capabilities: EngineCapabilities;
  tokens: EngineTokenReporting;
  pluginModel: EnginePluginModel;
}
