import type { TaskDependency } from "@weave/protocol";
import type { ScheduleStep, ScheduledState, SchedulableTask, SkippedTask } from "./types.ts";

const SETTLED_STATES: ReadonlySet<ScheduledState> = new Set(["ok", "failed", "cancelled", "skipped"]);
const FAILED_STATES: ReadonlySet<ScheduledState> = new Set(["failed", "cancelled", "skipped"]);

export function publishedOutputKey(producer: string, output: string): string {
  return `${producer}#${output}`;
}

function stateOf(states: ReadonlyMap<string, ScheduledState>, taskId: string): ScheduledState {
  return states.get(taskId) ?? "pending";
}

function missingOutputs(dependency: TaskDependency, published: ReadonlySet<string>): readonly string[] {
  return dependency.requiredOutputs.filter((output) => !published.has(publishedOutputKey(dependency.task, output)));
}

function brokenDependency(task: SchedulableTask, states: ReadonlyMap<string, ScheduledState>): SkippedTask | null {
  for (const dependency of task.dependencies ?? []) {
    const state = stateOf(states, dependency.task);
    if (FAILED_STATES.has(state)) return { taskId: task.id, reason: `dependency ${dependency.task} ended as ${state}` };
  }
  return null;
}

function unpublishedDependency(
  task: SchedulableTask,
  states: ReadonlyMap<string, ScheduledState>,
  published: ReadonlySet<string>,
): SkippedTask | null {
  for (const dependency of task.dependencies ?? []) {
    if (dependency.requiredOutputs.length === 0 || stateOf(states, dependency.task) !== "ok") continue;
    const missing = missingOutputs(dependency, published);
    if (missing.length > 0) return { taskId: task.id, reason: `dependency ${dependency.task} ended without publishing ${missing.join(", ")}` };
  }
  return null;
}

function isReady(task: SchedulableTask, states: ReadonlyMap<string, ScheduledState>, published: ReadonlySet<string>): boolean {
  return (task.dependencies ?? []).every((dependency) =>
    dependency.requiredOutputs.length === 0
      ? stateOf(states, dependency.task) === "ok"
      : missingOutputs(dependency, published).length === 0);
}

export function nextStep(
  tasks: readonly SchedulableTask[],
  states: ReadonlyMap<string, ScheduledState>,
  published: ReadonlySet<string> = new Set(),
): ScheduleStep {
  const pending = tasks.filter((task) => stateOf(states, task.id) === "pending");
  const skipped = pending
    .map((task) => brokenDependency(task, states) ?? unpublishedDependency(task, states, published))
    .filter((entry): entry is SkippedTask => entry !== null);
  const skippedIds = new Set(skipped.map((entry) => entry.taskId));
  const ready = pending
    .filter((task) => !skippedIds.has(task.id) && isReady(task, states, published))
    .map((task) => task.id);
  const isFinished = tasks.every(
    (task) => SETTLED_STATES.has(stateOf(states, task.id)) || skippedIds.has(task.id),
  );
  return { ready, skipped, isFinished };
}

export function topologicalOrder(tasks: readonly SchedulableTask[]): readonly string[] {
  const known = new Set(tasks.map((task) => task.id));
  const placed = new Set<string>();
  const order: string[] = [];
  const isPlaceable = (task: SchedulableTask): boolean =>
    (task.dependencies ?? []).every((dependency) => placed.has(dependency.task) || !known.has(dependency.task));
  for (let progressed = true; progressed; ) {
    progressed = false;
    for (const task of tasks.filter((candidate) => !placed.has(candidate.id) && isPlaceable(candidate))) {
      placed.add(task.id);
      order.push(task.id);
      progressed = true;
    }
  }
  return order;
}
