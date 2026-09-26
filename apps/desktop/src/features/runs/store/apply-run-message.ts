import type { BudgetAlert, RunUpdate } from "../../../../server/index.ts";
import { MAX_RUN_ALERTS, MAX_RUN_ARTIFACTS, PLANNER_TASK_ID } from "../constants";
import type { Lane, RunMessage, RunState } from "../types";
import { withArtifact, withDelivery } from "./artifacts";
import { applyLaneUpdate, emptyLane } from "./lane";
import { applyStreamUpdate } from "./stream";

type LaneUpdate = Extract<RunUpdate, { readonly taskId: string }>;
type PlanUpdate = Extract<RunUpdate, { readonly kind: "plan" }>;

function startedRun(runKey: string, request: string): RunState {
  return { runKey, request, approval: "none", plan: null, review: null, planning: null, execution: null, workerCount: null, artifacts: [], hiddenArtifactCount: 0, lanes: {}, laneOrder: [], stream: [], hiddenBlockCount: 0, contractVersion: null, integration: null, orchestration: null, budgetAlerts: [], hiddenAlertCount: 0, outcome: null };
}

function withPlan(run: RunState, update: PlanUpdate): RunState {
  const planned = update.tasks.map((task) => run.lanes[task.id] ?? emptyLane(task));
  const plannedIds = new Set(update.tasks.map((task) => task.id));
  const unplanned = run.laneOrder.filter((id) => !plannedIds.has(id));
  const lanes: Record<string, Lane> = { ...run.lanes };
  for (const lane of planned) lanes[lane.taskId] = lane;
  return { ...run, plan: { mode: update.mode, reason: update.reason, goal: update.goal, assumptions: update.assumptions, risks: update.risks }, lanes, laneOrder: [...planned.map((lane) => lane.taskId), ...unplanned] };
}

function withLaneUpdate(run: RunState, update: LaneUpdate): RunState {
  const existing = run.lanes[update.taskId];
  const lane = existing ?? emptyLane({ id: update.taskId, title: update.taskId, dependsOn: [], allowedPaths: [] });
  const laneOrder = existing ? run.laneOrder : [...run.laneOrder, update.taskId];
  const stream = applyStreamUpdate({ stream: run.stream, hiddenBlockCount: run.hiddenBlockCount }, update);
  return { ...run, lanes: { ...run.lanes, [update.taskId]: applyLaneUpdate(lane, update) }, laneOrder, ...stream };
}

function withBudgetAlert(run: RunState, alert: BudgetAlert): RunState {
  if (run.budgetAlerts.length >= MAX_RUN_ALERTS) return { ...run, hiddenAlertCount: run.hiddenAlertCount + 1 };
  return { ...run, budgetAlerts: [...run.budgetAlerts, alert] };
}

function applyUpdate(run: RunState, update: RunUpdate): RunState {
  if (update.kind === "artifact") return withLaneUpdate(withArtifact(run, update.taskId, update.artifact, MAX_RUN_ARTIFACTS), update);
  if (update.kind === "awaited-arrived") return withLaneUpdate(withDelivery(run, update.taskId, update.output, update.producer), update);
  switch (update.kind) {
    case "plan":
      return withPlan(run, update);
    case "contract-changed":
      return { ...run, contractVersion: update.version };
    case "integration":
      return { ...run, integration: { status: update.status, branch: update.branch, brokenBy: update.brokenBy } };
    case "plan-review":
      return { ...run, review: { classification: update.classification, critique: update.critique, warnings: update.warnings, hiddenWarningCount: update.hiddenWarningCount } };
    case "planning":
      return { ...run, planning: { ...run.planning, planner: update.planner, reviewer: update.reviewer } };
    case "execution-plan":
      return { ...run, execution: update.plan };
    case "worker-count":
      return { ...run, workerCount: update.count };
    case "awaiting-approval":
      return { ...run, approval: "waiting" };
    case "plan-approved":
      return { ...run, approval: "approved" };
    case "orchestration":
      return { ...run, orchestration: { workers: update.workers, reason: update.reason, estimatedCostMicroUsd: update.estimatedCostMicroUsd, timeSavedMs: update.timeSavedMs } };
    case "budget-exceeded":
      return withBudgetAlert(run, update.alert);
    default:
      if (update.taskId === PLANNER_TASK_ID) return { ...run, ...applyStreamUpdate({ stream: run.stream, hiddenBlockCount: run.hiddenBlockCount }, update) };
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
