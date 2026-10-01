import type { EngineCandidate, HistoryStats } from "../adaptive/index.ts";

export interface WorkItem {
  readonly description: string;
  readonly paths: readonly string[];
}

export interface WorkGroup {
  readonly areas: readonly string[];
  readonly items: readonly WorkItem[];
}

export interface GroupTask {
  readonly id: string;
  readonly prompt: string;
  readonly allowedPaths: readonly string[];
}

export interface ProposedWorker {
  readonly worker: number;
  readonly role: string | null;
  readonly areas: readonly string[];
  readonly items: readonly string[];
  readonly after: readonly number[];
  readonly estimatedMs: number;
}

export interface TeamEstimate {
  readonly recommendation: "team" | "keep-going";
  readonly reason: string;
  readonly workers: readonly ProposedWorker[];
  readonly oneWorkerMs: number;
  readonly teamMs: number;
  readonly historyRuns: number;
  readonly isRough: boolean;
}

export interface EstimateTeamInput {
  readonly items: readonly WorkItem[];
  readonly workspaces: readonly { readonly dir: string }[];
  readonly imports: readonly { readonly from: string; readonly to: string }[];
  readonly stats: HistoryStats;
  readonly engines: readonly EngineCandidate[];
  readonly maxWorkers: number;
  readonly roleOf: (task: GroupTask) => string | null;
}

export type ParsedItems = { readonly ok: true; readonly items: readonly WorkItem[] } | { readonly ok: false; readonly issue: string };
