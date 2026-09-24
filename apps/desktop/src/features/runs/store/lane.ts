import type { RunPlanTask, RunUpdate } from "../../../../server/index.ts";
import { MAX_LANE_FILES, MAX_LANE_TEXT_CHARS, MAX_LANE_TOOLS } from "../constants";
import type { Lane } from "../types";
import { applyWorkforceUpdate } from "./lane-workforce";

type LaneUpdate = Extract<RunUpdate, { readonly taskId: string }>;

export function emptyLane(task: RunPlanTask): Lane {
  return {
    taskId: task.id,
    title: task.title,
    dependsOn: task.dependsOn,
    status: "waiting",
    attempts: 0,
    text: "",
    tools: [],
    toolCount: 0,
    files: [],
    hiddenFileCount: 0,
    settledCostUsd: 0,
    attemptCostUsd: 0,
    reason: null,
    merge: null,
    employee: null,
    verification: null,
    claims: [],
    blockedReason: null,
    notes: [],
    noteCount: 0,
  };
}

function withFile(lane: Lane, path: string): Lane {
  if (lane.files.includes(path)) return lane;
  if (lane.files.length >= MAX_LANE_FILES) return { ...lane, hiddenFileCount: lane.hiddenFileCount + 1 };
  return { ...lane, files: [...lane.files, path] };
}

function withTool(lane: Lane, title: string): Lane {
  const tool = { id: lane.toolCount, title };
  return { ...lane, text: "", tools: [...lane.tools, tool].slice(-MAX_LANE_TOOLS), toolCount: lane.toolCount + 1 };
}

function startedAttempt(lane: Lane): Lane {
  return {
    ...lane,
    status: "running",
    attempts: lane.attempts + 1,
    text: "",
    tools: [],
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
      return { ...lane, text: (lane.text + update.text).slice(-MAX_LANE_TEXT_CHARS) };
    case "tool":
      return withTool(lane, update.title);
    case "file":
      return withFile(lane, update.path);
    case "cost":
      return { ...lane, attemptCostUsd: update.costUsd };
    case "task-settled":
      return { ...lane, status: update.status, reason: update.reason, blockedReason: null };
    case "merge":
      return { ...lane, merge: { status: update.status, detail: update.detail } };
    case "employee-assigned":
    case "employee-verified":
    case "claimed":
    case "blocked":
    case "dependency-added":
    case "note":
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
