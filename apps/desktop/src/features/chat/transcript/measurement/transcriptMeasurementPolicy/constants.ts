import type {
  ToolCallStatus,
  TranscriptMeasurementSafetyReason,
} from "./types";

export const TERMINAL_TOOL_STATUSES = new Set<ToolCallStatus>([
  "completed",
  "failed",
  "stopped",
]);

export const HARD_ESTIMATE_REASONS: readonly TranscriptMeasurementSafetyReason[] =
  [
    "focused-row",
    "active-selection",
    "open-overlay",
    "active-mcp-host-work",
    "active-nested-tool-request",
    "active-tool",
    "active-timer",
    "active-copy-feedback",
    "unknown-unsafe-descendant",
  ];
