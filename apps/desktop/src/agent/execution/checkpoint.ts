import type { TaskState, HandoffContext } from "../normalize/types";

// ---------------------------------------------------------------------------
// Checkpoint trigger rules (§3)
// ---------------------------------------------------------------------------

export type CheckpointReason =
  | "provider_limit"
  | "agent_crash"
  | "timeout"
  | "user_cancellation"
  | "max_turns"
  | "explicit_handoff"
  | "file_milestone"
  | "verification_milestone"
  | "test_milestone";

/** Returns true if a checkpoint should be created for this event type. */
export function shouldCheckpoint(
  eventType: string,
  state: TaskState,
): { checkpoint: boolean; reason?: CheckpointReason } {
  // Always checkpoint on terminal / interruption events
  if (eventType === "provider_limit") return { checkpoint: true, reason: "provider_limit" };
  if (eventType === "agent_crash") return { checkpoint: true, reason: "agent_crash" };
  if (eventType === "agent_timeout") return { checkpoint: true, reason: "timeout" };
  if (eventType === "agent_cancelled") return { checkpoint: true, reason: "user_cancellation" };
  if (eventType === "max_turns") return { checkpoint: true, reason: "max_turns" };
  if (eventType === "explicit_handoff") return { checkpoint: true, reason: "explicit_handoff" };

  // Milestone checkpoints — only when state has actually changed
  if (eventType === "file_written" && state.files.modified.length > 0) {
    return { checkpoint: true, reason: "file_milestone" };
  }
  if (eventType === "verification_result") {
    return { checkpoint: true, reason: "verification_milestone" };
  }
  if (eventType === "step_completed") {
    return { checkpoint: true, reason: "test_milestone" };
  }

  // Streaming tokens — never checkpoint
  return { checkpoint: false };
}

// ---------------------------------------------------------------------------
// Immutable checkpoint shape
// ---------------------------------------------------------------------------

export interface Checkpoint {
  schemaVersion: 1;
  id: string;             // e.g. "checkpoint-184"
  seq: number;            // monotonically increasing
  reason: CheckpointReason;
  timestamp: string;
  taskState: TaskState;
}

// ---------------------------------------------------------------------------
// Sequential ID generator
// ---------------------------------------------------------------------------

let _seq = 0;

export function nextCheckpointId(): string {
  _seq += 1;
  return `checkpoint-${_seq}`;
}

/** Reset the sequence counter (test/dev use only). */
export function resetCheckpointSeq(n = 0): void {
  _seq = n;
}

// ---------------------------------------------------------------------------
// Create an immutable checkpoint snapshot
// ---------------------------------------------------------------------------

export function createCheckpoint(
  taskState: TaskState,
  reason: CheckpointReason,
): Checkpoint {
  const id = nextCheckpointId();
  return {
    schemaVersion: 1,
    id,
    seq: _seq,
    reason,
    timestamp: new Date().toISOString(),
    taskState: deepFreeze({ ...taskState }),
  };
}

// Shallow-freeze a plain object (sufficient for our flat task state).
function deepFreeze<T extends object>(obj: T): T {
  return Object.freeze(obj) as T;
}
