import type { TaskState, WeaveEvent } from "@weave/protocol";
import { MAX_FAILURES } from "./constants.ts";

const FINISHED_STATUS = { ok: "completed", failed: "failed", cancelled: "cancelled" } as const;

function addFailure(state: TaskState, failure: TaskState["failures"][number]): void {
  if (state.failures.length < MAX_FAILURES) state.failures.push(failure);
}

export function foldLifecycle(state: TaskState, event: WeaveEvent): boolean {
  const engine = state.engineState;
  switch (event.type) {
    case "task.started":
      state.status = "running";
      return true;
    case "task.finished":
      state.status = FINISHED_STATUS[event.status];
      engine.lastStopReason = event.stopReason ?? event.status;
      if (event.status === "failed") addFailure(state, { kind: "engine", message: `worker stopped: ${event.stopReason ?? "failed"}`, where: "task.finished", atSeq: event.seq });
      return true;
    case "task.timeout":
      state.status = "paused";
      engine.lastStopReason = event.reason;
      return true;
    case "attempt.started":
      state.status = "running";
      engine.engineId = event.engineId;
      engine.sessionId = event.sessionId;
      engine.attempts = Math.max(engine.attempts, event.attemptIndex + 1);
      return true;
    case "attempt.ended":
      if (state.status === "running") state.status = "paused";
      engine.lastStopReason = event.endedBy;
      return true;
    case "agent.session":
      engine.sessionId = event.sessionId;
      engine.attempts = Math.max(engine.attempts, 1);
      return true;
    case "engine.capabilities":
      engine.engineId = event.engineId;
      return true;
    case "usage":
      engine.contextUsed = event.used;
      engine.contextSize = event.size;
      engine.costUsd = event.costUsd ?? engine.costUsd;
      return true;
    case "error":
      addFailure(state, { kind: "error", message: event.message, where: event.where, atSeq: event.seq });
      return true;
    default:
      return false;
  }
}
