import type { CheckpointReason, TaskContract, TaskState } from "@weave/protocol";
import type { ProjectModel } from "../context/index.ts";
import type { Ledger } from "../shared/index.ts";

export interface AttemptOutcome {
  readonly status: "ok" | "failed" | "cancelled";
  readonly stoppedBy: "maxTurns" | "timeoutMs" | "aborted" | null;
  readonly error: string | null;
  readonly contextUsed: number | null;
  readonly contextSize: number | null;
  readonly finalMessage: string;
}

export interface AttemptInput {
  readonly engineId: string;
  readonly attemptIndex: number;
  readonly task: TaskContract;
  readonly ledger: Ledger;
  readonly signal?: AbortSignal;
}

export type AttemptRunner = (input: AttemptInput) => Promise<AttemptOutcome>;

export interface RelayOptions {
  readonly task: TaskContract;
  readonly engines: readonly string[];
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly model: ProjectModel | null;
  readonly runAttempt: AttemptRunner;
  readonly maxAttempts?: number;
  readonly signal?: AbortSignal;
}

export type NextMove = "done" | "stop" | "same-engine" | "next-engine";

export interface AttemptRecord {
  readonly engineId: string;
  readonly status: AttemptOutcome["status"];
  readonly endedBy: CheckpointReason | null;
  readonly contextBytes: number;
}

export interface RelayResult {
  readonly status: "ok" | "failed" | "cancelled";
  readonly attempts: readonly AttemptRecord[];
  readonly state: TaskState;
  readonly finalMessage: string;
  readonly error: string | null;
}
