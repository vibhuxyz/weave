import type { BudgetAlert, RunUpdate } from "../../../../server/index.ts";
import { MAX_RUN_ALERTS } from "../constants";
import type { Lane, RunMessage, RunState } from "../types";
import { applyLaneUpdate, emptyLane } from "./lane";

type LaneUpdate = Extract<RunUpdate, { readonly taskId: string }>;
type PlanUpdate = Extract<RunUpdate, { readonly kind: "plan" }>;

function startedRun(runKey: string, request: string): RunState {
  return { runKey, request, plan: null, lanes: {}, laneOrder: [], contractVersion: null, integration: null, orchestration: null, budgetAlerts: [], hiddenAlertCount: 0, outcome: null };
}

function withPlan(run: RunState, update: PlanUpdate): RunState {
  const planned = update.tasks.map((task) => run.lanes[task.id] ?? emptyLane(task));
  const plannedIds = new Set(update.tasks.map((task) => task.id));
  const unplanned = run.laneOrder.filter((id) => !plannedIds.has(id));
  const lanes: Record<string, Lane> = { ...run.lanes };
  for (const lane of planned) lanes[lane.taskId] = lane;
  return { ...run, plan: { mode: update.mode, reason: update.reason }, lanes, laneOrder: [...planned.map((lane) => lane.taskId), ...unplanned] };
}

function withLaneUpdate(run: RunState, update: LaneUpdate): RunState {
  const existing = run.lanes[update.taskId];
  const lane = existing ?? emptyLane({ id: update.taskId, title: update.taskId, dependsOn: [] });
  const laneOrder = existing ? run.laneOrder : [...run.laneOrder, update.taskId];
  return { ...run, lanes: { ...run.lanes, [update.taskId]: applyLaneUpdate(lane, update) }, laneOrder };
}

function withBudgetAlert(run: RunState, alert: BudgetAlert): RunState {
  if (run.budgetAlerts.length >= MAX_RUN_ALERTS) return { ...run, hiddenAlertCount: run.hiddenAlertCount + 1 };
  return { ...run, budgetAlerts: [...run.budgetAlerts, alert] };
}

function applyUpdate(run: RunState, update: RunUpdate): RunState {
  switch (update.kind) {
    case "plan":
      return withPlan(run, update);
    case "contract-changed":
      return { ...run, contractVersion: update.version };
    case "integration":
      return { ...run, integration: { status: update.status, branch: update.branch, brokenBy: update.brokenBy } };
    case "orchestration":
      return { ...run, orchestration: { workers: update.workers, reason: update.reason, estimatedCostMicroUsd: update.estimatedCostMicroUsd, timeSavedMs: update.timeSavedMs } };
    case "budget-exceeded":
      return withBudgetAlert(run, update.alert);
    default:
      return withLaneUpdate(run, update);
  }
}

export function applyRunMessage(run: RunState | null, message: RunMessage): RunState | null {
  if (message.type === "run-started") return startedRun(message.runKey, message.request);
  if (run?.runKey !== message.runKey) return run;
  if (message.type === "run-finished") return { ...run, outcome: message.outcome };
  return applyUpdate(run, message.update);
}

export function applyRunMessages(run: RunState | null, messages: readonly RunMessage[]): RunState | null {
  return messages.reduce(applyRunMessage, run);
}
