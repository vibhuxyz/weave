import type { CheckpointReason } from "@weave/protocol";
import type { AttemptOutcome, NextMove } from "./types.ts";

export type LifecycleStage = "normal" | "compress-tool-output" | "trim-history" | "summarize" | "reconstruct" | "checkpoint" | "handoff";

export interface LifecycleSignal {
  readonly contextUsed: number | null;
  readonly contextSize: number | null;
  readonly isProviderLimited: boolean;
  readonly isEngineDown: boolean;
}

const STAGE_THRESHOLDS: readonly (readonly [number, LifecycleStage])[] = [
  [0.85, "reconstruct"],
  [0.75, "summarize"],
  [0.65, "trim-history"],
  [0.5, "compress-tool-output"],
];

const PROVIDER_LIMIT = /rate.?limit|quota|\b429\b|overloaded|usage limit|credit|capacity|billing/i;

export function lifecycleStage(signal: LifecycleSignal): LifecycleStage {
  if (signal.isProviderLimited || signal.isEngineDown) return "handoff";
  if (signal.contextUsed === null || !signal.contextSize) return "normal";
  const ratio = signal.contextUsed / signal.contextSize;
  return STAGE_THRESHOLDS.find(([threshold]) => ratio >= threshold)?.[1] ?? "normal";
}

export function isProviderLimit(error: string | null): boolean {
  return error !== null && PROVIDER_LIMIT.test(error);
}

export function afterAttempt(outcome: AttemptOutcome): { readonly move: NextMove; readonly reason: CheckpointReason | null } {
  if (outcome.status === "ok") return { move: "done", reason: null };
  if (outcome.stoppedBy === "aborted") return { move: "stop", reason: "user_cancellation" };
  if (outcome.stoppedBy === "maxTurns") return { move: "same-engine", reason: "max_turns" };
  if (outcome.stoppedBy === "timeoutMs") return { move: "same-engine", reason: "timeout" };
  if (isProviderLimit(outcome.error)) return { move: "next-engine", reason: "provider_limit" };
  if (outcome.status === "failed") return { move: "next-engine", reason: "agent_crash" };
  const stage = lifecycleStage({ contextUsed: outcome.contextUsed, contextSize: outcome.contextSize, isProviderLimited: false, isEngineDown: false });
  if (stage === "reconstruct") return { move: "same-engine", reason: "explicit_handoff" };
  return { move: "stop", reason: "user_cancellation" };
}
