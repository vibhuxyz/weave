import type { TaskContract } from "@weave/protocol";
import type { Ledger } from "../shared/index.ts";
import type { Harvest } from "../worktree/index.ts";

export interface WorkerInput {
  readonly task: TaskContract;
  readonly ledger: Ledger;
  readonly signal: AbortSignal;
}

export interface WorkerOutcome {
  readonly status: "ok" | "failed" | "cancelled";
  readonly error?: string;
  readonly finalMessage?: string;
}

export type RunWorker = (input: WorkerInput) => Promise<WorkerOutcome>;

export type InspectHarvest = (
  task: TaskContract,
  worktreePath: string,
  files: readonly string[],
) => Promise<string | null>;

export interface PoolOptions {
  readonly tasks: readonly TaskContract[];
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly concurrency: number;
  readonly runWorker: RunWorker;
  readonly signal?: AbortSignal;
  readonly shouldInstall?: boolean;
  readonly baseCommit?: string;
  readonly inspectHarvest?: InspectHarvest;
  readonly attempt?: number;
}

export type SettledStatus = "ok" | "failed" | "cancelled" | "skipped";

export interface PoolTaskReport {
  readonly taskId: string;
  readonly status: SettledStatus;
  readonly reason: string | null;
  readonly branch: string | null;
  readonly harvest: Harvest | null;
  readonly finalMessage: string | null;
  readonly installMs: number;
  readonly agentMs: number;
  readonly wallMs: number;
}

export interface PoolReport {
  readonly tasks: readonly PoolTaskReport[];
}

export interface PoolContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly runWorker: RunWorker;
  readonly signal: AbortSignal;
  readonly shouldInstall: boolean;
  readonly baseCommit: string | undefined;
  readonly inspectHarvest: InspectHarvest | undefined;
  readonly attempt: number;
}
