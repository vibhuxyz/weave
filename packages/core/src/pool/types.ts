import type { TaskContract } from "@weave/protocol";
import type { BudgetManager } from "../adaptive/index.ts";
import type { CoordinationChannel, CoordinationReport, Coordinator } from "../coordination/index.ts";
import type { Ledger } from "../shared/index.ts";
import type { Harvest, RunSnapshot } from "../worktree/index.ts";

export interface WorkerInput {
  readonly task: TaskContract;
  readonly ledger: Ledger;
  readonly signal: AbortSignal;
  readonly coordination: CoordinationChannel;
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

export interface PoolControls {
  concurrency: number;
  budget?: BudgetManager;
  priorityOf?: (taskId: string) => number;
  waitForOwnership: boolean;
}

export interface PoolSession {
  isOpen(taskId: string): boolean;
  retarget(taskId: string, patch: Partial<TaskContract>): boolean;
  admit(tasks: readonly TaskContract[]): { readonly ok: true } | { readonly ok: false; readonly reason: string };
  expand(taskId: string, patch: Partial<TaskContract>, incoming: readonly TaskContract[]): { readonly ok: true } | { readonly ok: false; readonly reason: string };
  setConcurrency(workers: number): void;
  setBudget(budget: BudgetManager): void;
  setPriority(priorityOf: (taskId: string) => number): void;
  resume(taskId: string): boolean;
}

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
  readonly snapshot?: RunSnapshot;
  readonly inspectHarvest?: InspectHarvest;
  readonly attempt?: number;
  readonly coordinator?: Coordinator;
  readonly budget?: BudgetManager;
  readonly priorityOf?: (taskId: string) => number;
  readonly controls?: PoolControls;
  readonly attachSession?: (session: PoolSession) => void;
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
  readonly ranIn: "shared" | "worktree" | null;
  readonly isRejected: boolean;
  readonly isSetupFailure: boolean;
}

export interface PoolReport {
  readonly tasks: readonly PoolTaskReport[];
  readonly coordination: CoordinationReport;
  readonly contracts?: readonly TaskContract[];
}

export interface PoolContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly runWorker: RunWorker;
  readonly signal: AbortSignal;
  readonly shouldInstall: boolean;
  readonly baseCommit: string | undefined;
  readonly sharedBase: string | null;
  readonly inspectHarvest: InspectHarvest | undefined;
  readonly attempt: number;
  readonly coordinator: Coordinator;
  readonly budget: BudgetManager | undefined;
  readonly priorityOf: ((taskId: string) => number) | undefined;
  readonly controls: PoolControls | undefined;
  readonly retryIndex?: number;
}
