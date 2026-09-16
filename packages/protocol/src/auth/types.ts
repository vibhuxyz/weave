import type { AuthMethod } from "../acp/index.ts";

export type EngineAuthPhase =
  | "idle"
  | "starting"
  | "authenticating"
  | "verifying";

export type EngineAuthStatus = "running" | "succeeded" | "failed";

export type AuthMethodKind =
  | "terminal"
  | "env_var"
  | "agent";

export interface EngineAuthMethod {
  id: string;
  name: string;
  description: string | null;
  kind: AuthMethodKind;
}

export interface EngineAuthOperation {
  engineId: string;
  methodId: string;
  phase: EngineAuthPhase;
  status: EngineAuthStatus;
  output: string[];
  error: string | null;
}
