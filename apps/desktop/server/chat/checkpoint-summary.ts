import type { Checkpoint } from "@weave/core";
import type { CheckpointReason } from "@weave/protocol";
import type { CheckpointStats } from "../shared/index.ts";

export interface CheckpointSummaryPayload {
  readonly checkpointId: string;
  readonly reason: CheckpointReason;
  readonly summary: CheckpointStats;
}

export function summarizeCheckpoint(checkpoint: Checkpoint): CheckpointSummaryPayload {
  const { state } = checkpoint;
  const filesModified =
    state.files.modified.length +
    state.files.created.length +
    state.files.deleted.length;

  const testsPassed = state.verification.filter((v) => v.status === "passed").length;
  const testsFailed = state.verification.filter((v) => v.status === "failed").length;

  const notes = state.inFlight.map((t) => {
    const loc = t.locations[0];
    return `${loc ?? t.title} — edit was in progress when the task stopped`;
  });

  return {
    checkpointId: checkpoint.id,
    reason: checkpoint.reason,
    summary: {
      filesModified,
      commandsExecuted: state.commands.length,
      testsPassed,
      testsFailed,
      notes,
    },
  };
}
