/**
 * The fold: `events.ndjson` → `TaskState`.
 *
 * `foldTaskState` must be pure — no I/O, no `Date.now()`, no randomness.
 * Same events in, same state out, forever. That is what makes a checkpoint
 * just `{ seq, foldTaskState(events.slice(0, seq)) }`, and what makes a
 * killed process recoverable: whatever reached the ledger can be folded, no
 * matter how the process died.
 *
 * Implement the function below. See instruction.md for the full contract —
 * this file only carries the signature and the type imports.
 */

import type { TaskState, WeaveEvent } from "./protocol/index.ts";

/** Fold one run's ledger into a `TaskState`. `goal` is the task's original
 * request (`TaskRecord.goal`); `taskId` identifies the task the events
 * belong to. */
export function foldTaskState(
  events: readonly WeaveEvent[],
  goal: string,
  taskId: string,
): TaskState {
  throw new Error("TODO: implement foldTaskState");
}
