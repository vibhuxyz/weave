import {
  CANCELLED_STOP_REASON,
  END_TURN_STOP_REASON,
  MAX_FAILURE_REASON_CHARS,
} from "../constants.ts";
import type { CompactionOutcome, ContextSnapshot, EngineCompactionStatus } from "../types.ts";

const ADAPTER_FAILURE_LINE = /^Compacting failed(?:: (.+?))?\.?$/;

function adapterFailureLine(engineText: string): string | null {
  const lines = engineText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const failure = lines.find((line) => ADAPTER_FAILURE_LINE.test(line));
  return failure ? failure.slice(0, MAX_FAILURE_REASON_CHARS) : null;
}

export interface ClassifyInput {
  readonly stopReason: string;
  readonly engineText: string;
  readonly engineStatus: EngineCompactionStatus | null;
  readonly contextAfter: ContextSnapshot | null;
}

export function classifyCompaction(input: ClassifyInput): CompactionOutcome {
  const { stopReason, engineText, engineStatus, contextAfter } = input;
  if (stopReason === CANCELLED_STOP_REASON) return { status: "cancelled" };
  if (stopReason !== END_TURN_STOP_REASON) {
    return { status: "failed", reason: `Engine stopped compaction with stop reason "${stopReason}".` };
  }
  if (engineStatus === "completed") return { status: "completed", contextAfter };
  if (engineStatus === "failed") return { status: "failed", reason: "Engine reported that compaction failed." };
  const failure = adapterFailureLine(engineText);
  if (failure) return { status: "failed", reason: failure };
  return { status: "completed", contextAfter };
}
