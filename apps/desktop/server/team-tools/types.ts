import type { TeamEstimate, TeamHandoff } from "@weave/core";

export interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
}

export type ToolRunner = (name: string, args: unknown) => Promise<ToolResult>;

export type JsonRpcId = string | number | null;

export interface TeamToolHost {
  readonly registry: TeamToolRegistry;
  readonly baseUrl: () => string;
}

export interface TeamToolRegistry {
  readonly register: (token: string, run: ToolRunner) => () => void;
  readonly runnerFor: (token: string) => ToolRunner | undefined;
}

export interface TurnEstimates {
  readonly clear: () => void;
  readonly latest: () => TeamEstimate | null;
}

export interface TurnHandoff {
  readonly allowHandoff: (open: boolean) => void;
  readonly clearHandoff: () => void;
  readonly submitHandoff: (args: unknown) => ToolResult;
  readonly currentHandoff: () => TeamHandoff | null;
  readonly whenHandoff: (listener: () => void) => () => void;
}
