import type { LaneStatus, StreamBlockStatus, TaskPhase } from "../types";

export const LANE_STATUS_LABEL = {
  waiting: "Waiting",
  running: "Running",
  ok: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
} as const satisfies Record<LaneStatus, string>;

export const LANE_STATUS_CLASS = {
  waiting: "text-agent-text-faint",
  running: "text-agent-progress-fg",
  ok: "text-agent-success",
  failed: "text-agent-critical-fg",
  cancelled: "text-agent-warn",
} as const satisfies Record<LaneStatus, string>;

export const BLOCK_STATUS_LABEL = {
  running: "Running",
  ok: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
} as const satisfies Record<StreamBlockStatus, string>;

export const BLOCK_STATUS_CLASS = {
  running: "text-agent-progress-fg",
  ok: "text-agent-success",
  failed: "text-agent-critical-fg",
  cancelled: "text-agent-warn",
} as const satisfies Record<StreamBlockStatus, string>;

export const PHASE_LABEL = {
  pending: "Pending",
  ready: "Ready",
  running: "Working",
  "partially-blocked": "Partially blocked",
  verifying: "Verifying",
  completed: "Done",
  failed: "Failed",
} as const satisfies Record<TaskPhase, string>;

export const PHASE_CLASS = {
  pending: "text-agent-text-faint",
  ready: "text-agent-text-muted",
  running: "text-agent-progress-fg",
  "partially-blocked": "text-agent-warn",
  verifying: "text-agent-progress-fg",
  completed: "text-agent-success",
  failed: "text-agent-critical-fg",
} as const satisfies Record<TaskPhase, string>;

export const PHASE_MARK = {
  pending: "\u25CB",
  ready: "\u25CB",
  running: "\u25CF",
  "partially-blocked": "\u25D0",
  verifying: "\u25D1",
  completed: "\u2713",
  failed: "\u2717",
} as const satisfies Record<TaskPhase, string>;
