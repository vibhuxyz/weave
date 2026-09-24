import type { TaskState, TaskStateV1 } from "@weave/protocol";
import { EMPTY_ENGINE_STATE } from "@weave/protocol";

export function upgradeTaskState(state: TaskState | TaskStateV1): TaskState {
  if (state.schemaVersion === 2) return state;
  return {
    schemaVersion: 2,
    taskId: state.taskId,
    goal: state.goal,
    atSeq: state.atSeq,
    status: "paused",
    completed: state.completed,
    currentStep: state.inProgress?.description ?? null,
    nextStep: state.remaining[0] ?? null,
    remaining: state.remaining,
    decisions: state.decisions,
    discoveries: [],
    changedFiles: { modified: state.files.modified, created: state.files.created, deleted: state.files.deleted },
    filesRead: state.files.read,
    failures: state.errors.map((error) => ({ kind: "error" as const, message: error.message, where: error.where, atSeq: error.atSeq })),
    verification: state.verification,
    commands: state.commands,
    openQuestions: [],
    dependencies: [],
    contextVersion: null,
    gitState: state.git,
    engineState: { ...EMPTY_ENGINE_STATE },
    inFlight: state.inFlight,
  };
}
