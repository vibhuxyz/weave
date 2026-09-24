import type { ChainEstimate } from "../estimate/index.ts";

export interface EngineCandidate {
  readonly id: string;
  readonly capabilities: Readonly<Record<string, boolean>>;
}

export interface RejectedEngine {
  readonly engineId: string;
  readonly reason: string;
}

export interface EngineRoute {
  readonly taskId: string;
  readonly engines: readonly string[];
  readonly estimate: ChainEstimate;
  readonly rejected: readonly RejectedEngine[];
  readonly reason: string;
}

export interface RoutableTask {
  readonly id: string;
  readonly prompt: string;
  readonly allowedPaths?: readonly string[];
  readonly component?: string;
  readonly capabilities?: readonly string[];
}
