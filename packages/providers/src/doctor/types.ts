export interface AuthMethodInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface AgentCapabilities {
  readonly models: boolean;
  readonly reasoning: boolean;
  readonly tools: boolean;
  readonly sessions: boolean;
}

export interface AgentDoctorResult {
  readonly installed: boolean;
  readonly authenticated: boolean;
  readonly usable: boolean;
  readonly version?: string;
  readonly error?: string;
  readonly authMethods?: readonly AuthMethodInfo[];
  readonly capabilities?: AgentCapabilities;
}
