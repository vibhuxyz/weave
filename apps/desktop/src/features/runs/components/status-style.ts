import type { LaneStatus, StreamBlockStatus } from "../types";

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
