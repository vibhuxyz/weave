import type { BudgetAlert, RunPlanTask, RunUpdate } from "../../../../server/index.ts";
import { MAX_LANE_AWAITED, MAX_RUN_ALERTS, MAX_RUN_ARTIFACTS, MAX_RUN_EVENTS, MAX_RUN_FILES, MAX_RUN_REPLANS, PLANNER_TASK_ID } from "../constants";
import type { AwaitedOutput, Lane, RunMessage, RunState } from "../types";
import { withArtifact, withDelivery } from "./artifacts";
import { withEvent } from "./events";
import { withFileChange } from "./files";
import { withReplanDecision, withReplanRequest } from "./replans";
import { applyLaneUpdate, emptyLane } from "./lane";
import { applyStreamUpdate } from "./stream";

type LaneUpdate = Extract<RunUpdate, { readonly taskId: string }>;
type PlanUpdate = Extract<RunUpdate, { readonly kind: "plan" }>;

function startedRun(runKey: string, request: string, routeReason: string | null): RunState {
  return { runKey, request, routeReason, repoSetup: null, resultDecision: null, approval: "none", startedAt: Date.now(), finishedAt: null, files: [], hiddenFileCount: 0, events: [], hiddenEventCount: 0, plan: null, review: null, rejections: [], planning: null, execution: null, workerCount: null, artifacts: [], hiddenArtifactCount: 0, replans: [], lanes: {}, laneOrder: [], stream: [], hiddenBlockCount: 0, contractVersion: null, integration: null, orchestration: null, budgetAlerts: [], hiddenAlertCount: 0, outcome: null };
}

function outputsAwaited(task: RunPlanTask, tasks: readonly RunPlanTask[]): readonly AwaitedOutput[] {
  if ((task.startsAfter ?? []).length > 0) return [];
  const producesOf = new Map(tasks.map((entry) => [entry.id, entry.produces ?? []]));
  const awaited: AwaitedOutput[] = [];
  for (const producer of task.dependsOn) {
    for (const output of producesOf.get(producer) ?? []) {
      if (awaited.length >= MAX_LANE_AWAITED) return awaited;
      awaited.push({ output, producer, hasArrived: false });
    }
  }
  return awaited;
}

function withPlan(run: RunState, update: PlanUpdate): RunState {
  const planned = update.tasks.map((task) => {
    const lane = run.lanes[task.id] ?? emptyLane(task);
    return lane.awaited.length > 0 ? lane : { ...lane, awaited: outputsAwaited(task, update.tasks) };
  });
  const plannedIds = new Set(update.tasks.map((task) => task.id));
  const unplanned = run.laneOrder.filter((id) => !plannedIds.has(id));
  const lanes: Record<string, Lane> = { ...run.lanes };
  for (const lane of planned) lanes[lane.taskId] = lane;
  return { ...run, plan: { mode: update.mode, reason: update.reason, goal: update.goal, assumptions: update.assumptions, risks: update.risks }, lanes, laneOrder: [...planned.map((lane) => lane.taskId), ...unplanned] };
}

function withLaneUpdate(run: RunState, update: LaneUpdate): RunState {
  const existing = run.lanes[update.taskId];
  if (!existing && update.kind === "employee-assigned") return run;
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
  if (update.kind === "file") {
    return withLaneUpdate({ ...run, ...withFileChange(run, update.taskId, update.path, update.change, MAX_RUN_FILES) }, update);
  }
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
    case "plan-rejected":
      return { ...run, rejections: [...run.rejections, { reasons: update.reasons, hiddenReasonCount: update.hiddenReasonCount, willRepair: update.willRepair }].slice(-4) };
    case "planning":
      return { ...run, planning: { ...run.planning, planner: update.planner, reviewer: update.reviewer } };
    case "execution-plan":
      return { ...run, execution: update.plan };
    case "worker-count":
      return { ...run, workerCount: update.count };
    case "replan-requested":
      return withReplanRequest(run, update, MAX_RUN_REPLANS);
    case "replan-decided":
      return withReplanDecision(run, update);
    case "awaiting-approval":
      return { ...run, approval: "waiting" };
    case "repo-setup":
      return { ...run, repoSetup: update.summary };
    case "result-decision":
      return { ...run, resultDecision: { status: update.status, summary: update.summary } };
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
  if (message.type === "run-started") return startedRun(message.runKey, message.request, message.routeReason ?? null);
  if (run?.runKey !== message.runKey) return run;
  if (message.type === "run-finished") return { ...run, outcome: message.outcome, finishedAt: Date.now() };
  return applyUpdate({ ...run, ...withEvent(run, message.update, MAX_RUN_EVENTS) }, message.update);
}

export function applyRunMessages(run: RunState | null, messages: readonly RunMessage[]): RunState | null {
  return messages.reduce(applyRunMessage, run);
}
