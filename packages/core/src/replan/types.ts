import type { TaskContract } from "@weave/protocol";
import type { EngineCandidate } from "../adaptive/index.ts";
import type { PoolReport } from "../pool/index.ts";
import type { REPLAN_ACTIONS } from "./constants.ts";

export type ReplanTask = TaskContract & { readonly title?: string };

export type ReplanTriggerKind = "worker-failed" | "worker-skipped" | "dependency-discovered" | "escalation";

export interface ReplanTrigger {
  readonly kind: ReplanTriggerKind;
  readonly taskId: string;
  readonly detail: string;
}

export type ReplanAction = (typeof REPLAN_ACTIONS)[number];

export interface ReplanRerun {
  readonly id: string;
  readonly engine?: string;
  readonly guidance?: string;
}

export interface ReplanDecision {
  readonly action: ReplanAction;
  readonly rerun: readonly ReplanRerun[];
  readonly reason: string;
}

export interface TaskOutcome {
  readonly taskId: string;
  readonly status: PoolReport["tasks"][number]["status"];
  readonly reason: string | null;
}

export interface ReplanPromptInput {
  readonly goal: string | null;
  readonly round: number;
  readonly tasks: readonly ReplanTask[];
  readonly outcomes: readonly TaskOutcome[];
  readonly triggers: readonly ReplanTrigger[];
  readonly engineIds: readonly string[];
}

export interface ReplanRequest extends ReplanPromptInput {
  readonly runTurn: (prompt: string, signal?: AbortSignal) => Promise<string>;
  readonly signal?: AbortSignal;
}

export type ParseDecisionResult =
  | { readonly ok: true; readonly decision: ReplanDecision }
  | { readonly ok: false; readonly issues: readonly string[] };

export interface ReplanOutcome {
  readonly decision: ReplanDecision;
  readonly warnings: readonly string[];
  readonly attempts: number;
}

export interface ReplanSources {
  readonly tasks: readonly ReplanTask[];
  readonly engineCandidates: readonly EngineCandidate[];
  readonly goal: string | null;
}
