import { describe, expect, it } from "bun:test";
import { persistRecoveryDecision } from "./recovery-helper.ts";
import type { Ledger, TasksStore } from "@weave/core";

describe("persistRecoveryDecision", () => {
  it("appends recovery.decided to ledger even when checkpointing is mocked", async () => {
    const appended: unknown[] = [];
    const mockLedger = {
      append: (type: string, data: unknown) => {
        appended.push({ type, ...data as object });
        return { runId: "r-1", seq: 1 };
      },
    } as unknown as Ledger;

    const mockTasksStore = {} as TasksStore;

    await persistRecoveryDecision(
      {
        weaveDir: "/fake/dir",
        cwd: "/fake/cwd",
        taskId: "task-1",
        runId: "run-1",
        goal: "test goal",
        tasksStore: mockTasksStore,
        ledger: mockLedger,
        sessionId: "session-1",
      },
      {
        checkpointReason: "provider_limit",
        attempt: 1,
        reason: "turn_ended_without_final",
        phase: "finalizing",
        action: "finalize",
      },
    );

    expect(appended.length).toBe(1);
    const event = appended[0] as {
      type: string;
      workSessionId: string;
      attempt: number;
      reason: string;
      phase: string;
      action: string;
    };
    expect(event.type).toBe("recovery.decided");
    expect(event.workSessionId).toBe("session-1");
    expect(event.attempt).toBe(1);
    expect(event.reason).toBe("turn_ended_without_final");
    expect(event.phase).toBe("finalizing");
    expect(event.action).toBe("finalize");
  });
});
