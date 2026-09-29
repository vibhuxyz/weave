import type { TaskDependency } from "@weave/protocol";
import type { ScheduledState } from "../scheduler/index.ts";
import { ENDED_STATES } from "./constants.ts";
import type { DagTask, PhaseInput, TaskPhase, TaskPhaseView } from "./types.ts";

export function outputKey(producer: string, output: string): string {
  return `${producer}#${output}`;
}

function stateOf(states: ReadonlyMap<string, ScheduledState>, taskId: string): ScheduledState {
  return states.get(taskId) ?? "pending";
}

function gatesStart(dependency: TaskDependency): boolean {
  return dependency.requiredOutputs.length === 0;
}

function dependenciesOf(task: DagTask): readonly TaskDependency[] {
  return task.dependencies ?? [];
}

function endedDependencies(task: DagTask, states: ReadonlyMap<string, ScheduledState>): readonly string[] {
  return dependenciesOf(task)
    .filter((dependency) => ENDED_STATES.has(stateOf(states, dependency.task)))
    .map((dependency) => dependency.task)
    .sort();
}

function unfinishedGates(task: DagTask, states: ReadonlyMap<string, ScheduledState>): readonly string[] {
  return dependenciesOf(task)
    .filter((dependency) => gatesStart(dependency) && stateOf(states, dependency.task) !== "ok")
    .map((dependency) => dependency.task)
    .sort();
}

function missingOutputs(task: DagTask, readyOutputs: ReadonlySet<string>): readonly string[] {
  return dependenciesOf(task)
    .flatMap((dependency) =>
      dependency.requiredOutputs
        .map((output) => outputKey(dependency.task, output))
        .filter((key) => !readyOutputs.has(key)),
    )
    .sort();
}

function phaseOf(task: DagTask, input: PhaseInput): TaskPhaseView {
  const { states, readyOutputs } = input;
  const state = stateOf(states, task.id);
  const taskId = task.id;

  if (state === "ok") return { taskId, phase: "completed", waitingFor: [], blockedBy: [] };
  if (ENDED_STATES.has(state)) return { taskId, phase: "failed", waitingFor: [], blockedBy: [] };

  const broken = endedDependencies(task, states);
  if (broken.length > 0) return { taskId, phase: "failed", waitingFor: [], blockedBy: broken };

  if (input.verifying?.has(taskId)) return { taskId, phase: "verifying", waitingFor: [], blockedBy: [] };

  const missing = missingOutputs(task, readyOutputs);
  if (state === "running") {
    const phase: TaskPhase = missing.length > 0 ? "partially-blocked" : "running";
    return { taskId, phase, waitingFor: missing, blockedBy: [] };
  }

  const gates = unfinishedGates(task, states);
  if (gates.length > 0) return { taskId, phase: "pending", waitingFor: gates, blockedBy: [] };
  return { taskId, phase: "ready", waitingFor: missing, blockedBy: [] };
}

export function taskPhases(input: PhaseInput): readonly TaskPhaseView[] {
  return input.tasks
    .map((task) => phaseOf(task, input))
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function phaseByTask(input: PhaseInput): ReadonlyMap<string, TaskPhase> {
  return new Map(taskPhases(input).map((view) => [view.taskId, view.phase]));
}
