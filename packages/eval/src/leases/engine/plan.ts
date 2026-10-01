import type { SchedulableTask } from "@weave/core";
import { integerBetween, uniform } from "../../orchestration/sim/index.ts";
import { DEPENDENCY_WINDOW, EXPECTED_OUTPUT_PREFIX, WRONG_OUTPUT } from "../constants.ts";
import type { Fate, SimulationConfig } from "../types.ts";

const TASK_ID_DIGITS = 3;
const SLOT_ID_DIGITS = 2;

export function taskIdOf(index: number): string {
  return `T${String(index + 1).padStart(TASK_ID_DIGITS, "0")}`;
}

export function slotIdOf(index: number): string {
  return `w${String(index + 1).padStart(SLOT_ID_DIGITS, "0")}`;
}

export function planTasks(config: SimulationConfig): readonly SchedulableTask[] {
  return Array.from({ length: config.tasks }, (_, index) => {
    const id = taskIdOf(index);
    const hasDependency = index > 0 && uniform(config.seed, id, "depends") < config.dependencyRate;
    if (!hasDependency) return { id };
    const earliest = Math.max(0, index - DEPENDENCY_WINDOW);
    const on = taskIdOf(integerBetween(earliest, index - 1, config.seed, id, "on"));
    return { id, dependencies: [{ task: on, requiredOutputs: [] }] };
  });
}

export function fateOf(config: SimulationConfig, taskId: string, attempt: number): Fate {
  const roll = uniform(config.seed, taskId, attempt, "fate");
  const workMs = integerBetween(config.minTaskMs, config.maxTaskMs, config.seed, taskId, attempt, "work");
  const failAfterMs = Math.floor(uniform(config.seed, taskId, attempt, "when") * workMs);
  if (roll < config.crashRate) return { kind: "crash", afterMs: failAfterMs };
  if (roll < config.crashRate + config.hangRate) return { kind: "hang", afterMs: failAfterMs };
  if (roll < config.crashRate + config.hangRate + config.wrongOutputRate) return { kind: "wrong-output", workMs };
  return { kind: "finish", workMs };
}

export function expectedOutputOf(taskId: string): string {
  return `${EXPECTED_OUTPUT_PREFIX}${taskId}`;
}

export function outputOf(taskId: string, fate: Fate): string {
  return fate.kind === "wrong-output" ? WRONG_OUTPUT : expectedOutputOf(taskId);
}
