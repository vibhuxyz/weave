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

export interface TerminalPromptAnswer {
  readonly whenOutputIncludes: string;
  readonly input: string;
}

export type EngineTerminalAuth =
  | { readonly transport: "pipe" }
  | { readonly transport: "pty"; readonly promptAnswers: readonly TerminalPromptAnswer[] };

/**
 * A first-run wizard the engine's own CLI shows before it will do any work.
 * It is a full-screen TUI, so it is driven in a PTY and shown to the user
 * rather than answered for them.
 */
export interface EngineSetup {
  /** Binary to run, resolved on PATH. */
  readonly command: string;
  readonly args?: readonly string[];
  /** Setup is complete once this path exists, relative to the home directory. */
  readonly completedWhenExists: string;
  /** Shown above the terminal so the user knows what they are agreeing to. */
  readonly description: string;
}

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
  terminalAuth?: EngineTerminalAuth;
  setup?: EngineSetup;
}
