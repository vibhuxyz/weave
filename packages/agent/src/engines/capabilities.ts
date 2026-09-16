import type { EngineCapabilities, EngineTokenReporting } from "./types.ts";

export const FULL_TOKEN_REPORTING: EngineTokenReporting = {
  contextWindow: true,
  turnTotals: true,
  cost: true,
};

export const NO_TOKEN_REPORTING: EngineTokenReporting = {
  contextWindow: false,
  turnTotals: false,
  cost: false,
};

const BASE_ACP_CAPABILITIES: Pick<
  EngineCapabilities,
  "streaming" | "toolCalls" | "fileEditing" | "permissions" | "resume" | "handoff"
> = {
  streaming: true,
  toolCalls: true,
  fileEditing: true,
  permissions: true,
  resume: true,
  handoff: true,
};

const UNDOCUMENTED_DEVICE_CAPABILITIES = {
  browser: false,
  computerUse: false,
} as const;

export const CLAUDE_CODE_CAPABILITIES: EngineCapabilities = {
  ...BASE_ACP_CAPABILITIES,
  mcp: true,
  planning: true,
  subagents: true,
  skills: true,
  sandbox: false,
  ...UNDOCUMENTED_DEVICE_CAPABILITIES,
};

export const CODEX_CAPABILITIES: EngineCapabilities = {
  ...BASE_ACP_CAPABILITIES,
  mcp: true,
  planning: true,
  subagents: false,
  skills: false,
  sandbox: false,
  ...UNDOCUMENTED_DEVICE_CAPABILITIES,
};

export const AMP_CAPABILITIES: EngineCapabilities = {
  ...BASE_ACP_CAPABILITIES,
  mcp: false,
  planning: false,
  subagents: false,
  skills: false,
  sandbox: false,
  ...UNDOCUMENTED_DEVICE_CAPABILITIES,
};

export const ANTIGRAVITY_CAPABILITIES: EngineCapabilities = {
  ...BASE_ACP_CAPABILITIES,
  mcp: false,
  planning: false,
  subagents: false,
  skills: false,
  sandbox: true,
  ...UNDOCUMENTED_DEVICE_CAPABILITIES,
};
