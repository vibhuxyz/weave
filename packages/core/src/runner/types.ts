import type { openSession, PermissionPolicy } from "@weave/agent";
import type { RunConfig, TaskContract, TaskResult, Usage, WeaveEvent } from "@weave/protocol";
import type { Ledger } from "../shared/index.ts";
import type { Worktree } from "../worktree/index.ts";

export type Session = Awaited<ReturnType<typeof openSession>>;

export interface RunTaskOptions {
  task: TaskContract;
  config?: RunConfig;
  policy?: PermissionPolicy;
  ledger?: Ledger;
  resumeSessionId?: string | null;
  verifyAfter?: boolean;
  onEvent?: (event: WeaveEvent) => void;
  isolate?: boolean;
  signal?: AbortSignal;
}

export interface RunTaskOutcome {
  result: TaskResult;
  runId: string;
  ledgerFile: string;
  sessionId: string;
  turns: number;
  costUsd?: number;
  contextUsed?: number;
  contextSize?: number;
  turnUsage?: Usage | null;
  worktree?: Worktree | null;
  finalMessage: string;
}

export interface RunTaskContext {
  task: TaskContract;
  ledger: Ledger;
  emit: (event: WeaveEvent) => void;
}
