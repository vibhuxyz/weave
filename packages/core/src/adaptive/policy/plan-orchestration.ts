import { DEFAULT_STARTUP_MS, bottomLevels, taskKindOf, taskSizeUnits } from "../estimate/index.ts";
import { routeTask } from "../routing/index.ts";
import { chooseWorkers } from "../workers/index.ts";
import type { OrchestrationDecision, OrchestrationInput, TaskPlan } from "./types.ts";

const DEFAULT_MS_PER_MICRO_USD = 0;
export const MIN_HISTORY_RUNS = 3;

function coldStart(input: OrchestrationInput, tasks: readonly TaskPlan[]): OrchestrationDecision {
  const configured = input.engines.map((engine) => engine.id);
  const workers = Math.max(1, Math.min(input.coldStartWorkers ?? 1, input.maxWorkers));
  const kept = tasks.map((plan) => ({ ...plan, route: { ...plan.route, engines: configured, reason: "not enough history: configured order" } }));
  const benefit = { workers, makespanMs: 0, timeSaved: 0, coordination: 0, mergeRisk: 0, verification: 0, startup: 0, total: 0 };
  const reason = `${workers} worker(s): only ${input.stats.runs} run(s) of history, fewer than ${MIN_HISTORY_RUNS}; keeping the baseline plan`;
  return { workers, reason, benefit, considered: [], estimatedCostMicroUsd: 0n, tasks: kept };
}

export function planOrchestration(input: OrchestrationInput): OrchestrationDecision {
  const startupMs = input.stats.startupMs ?? DEFAULT_STARTUP_MS;
  const msPerMicroUsd = input.msPerMicroUsd ?? DEFAULT_MS_PER_MICRO_USD;
  const routes = input.tasks.map((task) => routeTask({ task, candidates: input.engines, stats: input.stats, msPerMicroUsd }));
  const durations = new Map(routes.map((route) => [route.taskId, route.estimate.expectedMs + startupMs]));
  const priorities = bottomLevels(input.tasks, (taskId) => durations.get(taskId) ?? startupMs);
  const tasks: TaskPlan[] = input.tasks.map((task, index) => ({
    taskId: task.id,
    kind: taskKindOf(task),
    sizeUnits: taskSizeUnits(task),
    estimatedMs: durations.get(task.id) ?? startupMs,
    priorityMs: priorities.get(task.id) ?? 0,
    route: routes[index] ?? routeTask({ task, candidates: input.engines, stats: input.stats, msPerMicroUsd }),
  }));
  if (input.stats.runs < MIN_HISTORY_RUNS) return coldStart(input, tasks);
  const choice = chooseWorkers({
    tasks: input.tasks,
    durationOf: (taskId) => durations.get(taskId) ?? startupMs,
    stats: input.stats,
    maxWorkers: input.maxWorkers,
    startupMs,
    ...(input.maxRunWallMs === undefined ? {} : { maxWallMs: input.maxRunWallMs }),
  });
  const estimatedCostMicroUsd = tasks.reduce((total, plan) => total + plan.route.estimate.expectedCostMicroUsd, 0n);
  return { workers: choice.workers, reason: choice.reason, benefit: choice.chosen, considered: choice.considered, estimatedCostMicroUsd, tasks };
}
