import type { Employee } from "../model/index.ts";

export interface AssignableTask {
  readonly id: string;
  readonly prompt: string;
  readonly title?: string;
  readonly allowedPaths?: readonly string[];
  readonly component?: string;
  readonly employee?: string;
}

export interface EmployeePerformance {
  readonly tasks: number;
  readonly ok: number;
  readonly medianWallMs: number | null;
}

export interface ResolveOptions {
  readonly configuredEngines: readonly string[];
  readonly performance?: ReadonlyMap<string, EmployeePerformance>;
}

export interface Candidate {
  readonly employee: Employee;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly blockers: readonly string[];
}

export interface Resolution {
  readonly taskId: string;
  readonly chosen: Candidate | null;
  readonly candidates: readonly Candidate[];
  readonly reason: string;
}
