import type { TaskDependency } from "@weave/protocol";
import type { AvailableOutputs, ScheduleStep, ScheduledState, SchedulableTask, SkippedTask } from "./types.ts";

const SETTLED_STATES: ReadonlySet<ScheduledState> = new Set(["ok", "failed", "cancelled", "skipped"]);
const FAILED_STATES: ReadonlySet<ScheduledState> = new Set(["failed", "cancelled", "skipped"]);

function stateOf(states: ReadonlyMap<string, ScheduledState>, taskId: string): ScheduledState {
  return states.get(taskId) ?? "pending";
}

function brokenDependency(
  task: SchedulableTask,
  states: ReadonlyMap<string, ScheduledState>,
): SkippedTask | null {
  for (const dependency of task.dependencies ?? []) {
    const state = stateOf(states, dependency.task);
    if (FAILED_STATES.has(state)) {
      return { taskId: task.id, reason: `dependency ${dependency.task} ended as ${state}` };
    }
  }
  return null;
}

const NO_OUTPUTS: AvailableOutputs = new Map();

function hasPublishedOutputs(dependency: TaskDependency, available: AvailableOutputs): boolean {
  const published = available.get(dependency.task);
  return dependency.requiredOutputs.length > 0 && dependency.requiredOutputs.every((output) => published?.has(output) ?? false);
}

function isReady(task: SchedulableTask, states: ReadonlyMap<string, ScheduledState>, available: AvailableOutputs): boolean {
  return (task.dependencies ?? []).every(
    (dependency) => stateOf(states, dependency.task) === "ok" || hasPublishedOutputs(dependency, available),
  );
}

export function nextStep(
  tasks: readonly SchedulableTask[],
  states: ReadonlyMap<string, ScheduledState>,
  available: AvailableOutputs = NO_OUTPUTS,
): ScheduleStep {
  const pending = tasks.filter((task) => stateOf(states, task.id) === "pending");
  const skipped = pending
    .map((task) => brokenDependency(task, states))
    .filter((entry): entry is SkippedTask => entry !== null);
  const skippedIds = new Set(skipped.map((entry) => entry.taskId));
  const ready = pending
    .filter((task) => !skippedIds.has(task.id) && isReady(task, states, available))
    .map((task) => task.id);
  const isFinished = tasks.every(
    (task) => SETTLED_STATES.has(stateOf(states, task.id)) || skippedIds.has(task.id),
  );
  return { ready, skipped, isFinished };
}

export function topologicalOrder(tasks: readonly SchedulableTask[]): readonly string[] {
  const order: string[] = [];
  const states = new Map<string, ScheduledState>();
  for (let step = nextStep(tasks, states); step.ready.length > 0; step = nextStep(tasks, states)) {
    for (const taskId of step.ready) {
      order.push(taskId);
      states.set(taskId, "ok");
    }
  }
  return order;
}
