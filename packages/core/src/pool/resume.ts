import type { Coordinator } from "../coordination/index.ts";
import type { ScheduledState } from "../scheduler/index.ts";
import type { PoolControls, PoolSession, PoolTaskReport } from "./types.ts";

interface Waiter {
  readonly promise: Promise<null>;
  readonly resolve: () => void;
}

function waiter(): Waiter {
  let resolve: () => void = () => undefined;
  const promise = new Promise<null>((settle) => { resolve = () => settle(null); });
  return { promise, resolve };
}

export interface ResumeSlot {
  readonly promise: Promise<null>;
  readonly wake: () => void;
  readonly close: () => void;
  readonly resume: (taskId: string) => boolean;
}

export function sessionFor(input: {
  readonly states: Map<string, ScheduledState>;
  readonly resume: (taskId: string) => boolean;
  readonly coordinator: Coordinator;
  readonly controls: PoolControls | undefined;
}): PoolSession {
  const { states, coordinator, controls } = input;
  return {
    isOpen: (taskId) => {
      const state = states.get(taskId);
      return state === undefined || state === "pending" || state === "running";
    },
    retarget: (taskId, patch) => coordinator.retarget(taskId, patch),
    admit: (tasks) => coordinator.admit(tasks),
    setConcurrency: (workers) => { if (controls) controls.concurrency = workers; },
    setBudget: (budget) => { if (controls) controls.budget = budget; },
    setPriority: (priorityOf) => { if (controls) controls.priorityOf = priorityOf; },
    resume: input.resume,
  };
}

export function createResumeSlot(
  states: Map<string, ScheduledState>,
  reports: Map<string, PoolTaskReport>,
  taskIds: () => readonly string[],
): ResumeSlot {
  let pending = waiter();
  let open = true;
  const wake = (): void => {
    pending.resolve();
    pending = waiter();
  };
  return {
    get promise() { return pending.promise; },
    wake,
    close: () => { open = false; },
    resume: (taskId) => {
      if (!open || states.get(taskId) !== "failed") return false;
      states.set(taskId, "pending");
      reports.delete(taskId);
      for (const id of taskIds()) {
        const report = reports.get(id);
        if (report?.status !== "skipped" || !report.reason?.includes(`dependency ${taskId} `)) continue;
        states.set(id, "pending");
        reports.delete(id);
      }
      wake();
      return true;
    },
  };
}
