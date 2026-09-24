import type { RunUpdate } from "../../../../server/index.ts";
import type { Lane, RunMessage, RunState } from "../types";
import { MAX_RUN_ALERTS } from "../constants";
import { applyLaneUpdate, emptyLane, withLaneEvent } from "./lane";

type LaneUpdate = Extract<RunUpdate, { readonly taskId: string }>;
type PlanUpdate = Extract<RunUpdate, { readonly kind: "plan" }>;
type CoordinationUpdate = Extract<RunUpdate, { readonly kind: "coordination" }>;
type BudgetUpdate = Extract<RunUpdate, { readonly kind: "budget" }>;
type StartedMessage = Extract<RunMessage, { readonly type: "run-started" }>;

function startedRun(message: StartedMessage): RunState {
  return {
    runKey: message.runKey, request: message.request, plan: null, lanes: {}, laneOrder: [], contractVersion: null, integration: null, outcome: null,
    options: message.options ?? null, decision: null, budgetAlerts: [], escalations: [],
  };
}

function laneOf(run: RunState, taskId: string): { readonly lane: Lane; readonly laneOrder: readonly string[] } {
  const existing = run.lanes[taskId];
  return existing
    ? { lane: existing, laneOrder: run.laneOrder }
    : { lane: emptyLane({ id: taskId, title: taskId, dependsOn: [] }), laneOrder: [...run.laneOrder, taskId] };
}

function withCoordination(run: RunState, update: CoordinationUpdate): RunState {
  if (update.taskId === null) {
    const entry = { id: run.escalations.length, event: update.event, summary: update.summary };
    return { ...run, escalations: [...run.escalations, entry].slice(-MAX_RUN_ALERTS) };
  }
  const { lane, laneOrder } = laneOf(run, update.taskId);
  return { ...run, lanes: { ...run.lanes, [update.taskId]: withLaneEvent(lane, update.event, update.summary) }, laneOrder };
}

function withBudget(run: RunState, update: BudgetUpdate): RunState {
  const alert = { taskId: update.taskId, scope: update.scope, key: update.key, dimension: update.dimension, limit: update.limit, spent: update.spent, action: update.action };
  return { ...run, budgetAlerts: [...run.budgetAlerts, alert].slice(-MAX_RUN_ALERTS) };
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
  const { lane, laneOrder } = laneOf(run, update.taskId);
  return { ...run, lanes: { ...run.lanes, [update.taskId]: applyLaneUpdate(lane, update) }, laneOrder };
}

function applyUpdate(run: RunState, update: RunUpdate): RunState {
  switch (update.kind) {
    case "plan":
      return withPlan(run, update);
    case "contract-changed":
      return { ...run, contractVersion: update.version };
    case "integration":
      return { ...run, integration: { status: update.status, branch: update.branch, brokenBy: update.brokenBy } };
    case "decision":
      return { ...run, decision: { workers: update.workers, reason: update.reason, benefitMs: update.benefitMs, estimatedCostMicroUsd: update.estimatedCostMicroUsd, routes: update.routes } };
    case "coordination":
      return withCoordination(run, update);
    case "budget":
      return withBudget(run, update);
    default:
      return withLaneUpdate(run, update);
  }
}

export function applyRunMessage(run: RunState | null, message: RunMessage): RunState | null {
  if (message.type === "run-started") return startedRun(message);
  if (run?.runKey !== message.runKey) return run;
  if (message.type === "run-finished") return { ...run, outcome: message.outcome };
  return applyUpdate(run, message.update);
}

export function applyRunMessages(run: RunState | null, messages: readonly RunMessage[]): RunState | null {
  return messages.reduce(applyRunMessage, run);
}
