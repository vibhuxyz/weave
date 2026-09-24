import type { ApiFact } from "../types.ts";

export interface ImpactTargets {
  readonly files?: readonly string[];
  readonly symbols?: readonly string[];
}

export interface Reached {
  readonly id: string;
  readonly depth: number;
}

export interface ImpactReport {
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly dependents: readonly Reached[];
  readonly callers: readonly Reached[];
  readonly apis: readonly ApiFact[];
  readonly tests: readonly string[];
  readonly workspaces: readonly string[];
  readonly isTruncated: boolean;
}
