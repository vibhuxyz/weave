import type { AuthMethod } from "../auth/index.ts";
import type { AgentCapabilities, AuthMethodInfo } from "../doctor/index.ts";

export interface ProviderRuntime {
  readonly command: string;
  readonly args?: readonly string[];
}

export interface AgentProvider {
  readonly id: string;
  readonly name: string;
  readonly runtime: ProviderRuntime;
  readonly auth: AuthMethod;
  readonly capabilities: AgentCapabilities;
}

export interface ProviderState {
  readonly providerId: string;
  readonly installed: boolean;
  readonly authenticated: boolean;
  readonly usable: boolean;
  readonly capabilities?: AgentCapabilities;
  readonly version?: string;
  readonly error?: string;
  readonly availableAuthMethods?: readonly AuthMethodInfo[];
}
