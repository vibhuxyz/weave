import type { WeaveEvent } from "@weave/protocol";

export interface ExecutionTask {
  readonly id: string;
  readonly dependencies?: readonly { readonly task: string }[];
}

export interface ExecutionPlanInput {
  readonly tasks: readonly ExecutionTask[];
  readonly workers: number;
  readonly employeesByTask: ReadonlyMap<string, string>;
  readonly enginesByTask: ReadonlyMap<string, readonly string[]>;
  readonly defaultEngines: readonly string[];
  readonly estimatedMsByTask: ReadonlyMap<string, number> | null;
  readonly estimatedCostMicroUsd: bigint | null;
}

export interface ExecutionSlot {
  readonly taskId: string;
  readonly worker: number;
  readonly employeeId: string | null;
  readonly engineId: string | null;
  readonly fallbackEngineIds: readonly string[];
  readonly after: readonly string[];
  readonly startMs: number;
  readonly endMs: number;
}

export interface ExecutionPlan {
  readonly workers: number;
  readonly timing: "estimated" | "order-only";
  readonly estimatedMs: number | null;
  readonly estimatedCostMicroUsd: bigint | null;
  readonly slots: readonly ExecutionSlot[];
}

export type ExecutionPlanEvent = Omit<Extract<WeaveEvent, { type: "plan.execution" }>, "type" | "runId" | "seq" | "at" | "taskId">;
