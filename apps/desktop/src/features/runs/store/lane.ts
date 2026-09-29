import type { RunPlanTask, RunUpdate } from "../../../../server/index.ts";
import { PLAN_ASSIGNMENT_REASON } from "../constants";
import type { Lane } from "../types";
import { applyWorkforceUpdate } from "./lane-workforce";

type LaneUpdate = Extract<RunUpdate, { readonly taskId: string }>;

export function emptyLane(task: RunPlanTask): Lane {
  return {
    taskId: task.id,
    title: task.title,
    dependsOn: task.dependsOn,
    startsAfter: task.startsAfter ?? [],
    allowedPaths: task.allowedPaths,
    readOnlyPaths: task.readOnlyPaths ?? [],
    subtasks: task.subtasks ?? [],
    subtasksDone: [],
    awaited: [],
    skills: task.skills ?? [],
    produces: task.produces ?? [],
    plannedEngineId: task.engineId ?? null,
    verifyRung: task.verifyRung ?? null,
    complexity: task.complexity ?? null,
    status: "waiting",
    activity: null,
    verifyingRung: null,
    changedFiles: 0,
    wallMs: null,
    installMs: null,
    attempts: 0,
    settledCostUsd: 0,
    attemptCostUsd: 0,
    reason: null,
    merge: null,
    employee: task.employeeId ? { employeeId: task.employeeId, reasons: [PLAN_ASSIGNMENT_REASON] } : null,
    verification: null,
    claims: [],
    blockedReason: null,
    notes: [],
    noteCount: 0,
  };
}

function startedAttempt(lane: Lane): Lane {
  return {
    ...lane,
    status: "running",
    attempts: lane.attempts + 1,
    activity: null,
    verifyingRung: null,
    reason: null,
    merge: null,
    blockedReason: null,
    verification: null,
    settledCostUsd: lane.settledCostUsd + lane.attemptCostUsd,
    attemptCostUsd: 0,
  };
}

export function applyLaneUpdate(lane: Lane, update: LaneUpdate): Lane {
  switch (update.kind) {
    case "task-started":
      return startedAttempt(lane);
    case "text":
    case "thought":
    case "tool":
    case "tool-update":
      return lane;
    case "file":
      return { ...lane, changedFiles: lane.changedFiles + 1 };
    case "activity":
      return { ...lane, activity: update.activity };
    case "verifying":
      return { ...lane, verifyingRung: update.rung };
    case "cost":
      return { ...lane, attemptCostUsd: update.costUsd };
    case "task-settled":
      return { ...lane, status: update.status, reason: update.reason, blockedReason: null, verifyingRung: null, activity: null, wallMs: update.wallMs, installMs: update.installMs };
    case "merge":
      return { ...lane, merge: { status: update.status, detail: update.detail } };
    case "employee-assigned":
    case "employee-verified":
    case "claimed":
    case "blocked":
    case "dependency-added":
    case "note":
    case "subtask":
    case "artifact":
    case "awaiting":
    case "awaited-arrived":
      return applyWorkforceUpdate(lane, update);
    default: {
      const unreachable: never = update;
      return unreachable;
    }
  }
}

export function laneCostUsd(lane: Lane): number {
  return lane.settledCostUsd + lane.attemptCostUsd;
}
