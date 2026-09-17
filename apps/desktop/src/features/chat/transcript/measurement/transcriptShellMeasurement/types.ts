import type { VirtualLayoutPendingReason } from "../transcriptLayoutPending";
import type {
  TranscriptMeasurementPolicyDecision,
  TranscriptMeasurementPolicyInput,
  TranscriptMeasurementSafetyReason,
  TranscriptRowKind,
} from "../transcriptMeasurementPolicy";

export const VIRTUAL_ROW_MEASUREMENT_SHELL_ATTRIBUTE =
  "data-virtual-row-measurement-shell";
export const VIRTUAL_ROW_SHELL_KIND_ATTRIBUTE = "data-virtual-row-shell-kind";
export const VIRTUAL_ROW_SHELL_BLOCK_ATTRIBUTE = "data-virtual-row-shell-block";
export const VIRTUAL_ROW_SHELL_BLOCK_KIND_ATTRIBUTE =
  "data-virtual-row-shell-block-kind";

export type TranscriptShellMeasurementStatus =
  | "ready"
  | "not-eligible"
  | "blocked";

export type TranscriptShellBlockKind =
  | "action-required"
  | "attachment-strip"
  | "chip-strip"
  | "image"
  | "mcp-app"
  | "reasoning"
  | "system-notice"
  | "text"
  | "tool"
  | "unknown";

export interface TranscriptShellMeasurementBlock {
  key: string;
  kind: TranscriptShellBlockKind;
  estimatedBlockSize: number;
  reservedBlockSize?: number;
  pendingReason?: VirtualLayoutPendingReason;
}

export interface TranscriptShellMeasurementPlan {
  status: TranscriptShellMeasurementStatus;
  rowKind: TranscriptRowKind;
  policyDecision: TranscriptMeasurementPolicyDecision;
  estimatedBlockSize: number;
  reservedBlockSize: number | null;
  blocks: readonly TranscriptShellMeasurementBlock[];
  reasons: readonly TranscriptMeasurementSafetyReason[];
}

export interface TranscriptShellMeasurementInput
  extends TranscriptMeasurementPolicyInput {
  policyDecision?: TranscriptMeasurementPolicyDecision;
  estimatedBlockSize?: number;
}

export interface TranscriptShellRootAttributes {
  [VIRTUAL_ROW_MEASUREMENT_SHELL_ATTRIBUTE]: "true";
  [VIRTUAL_ROW_SHELL_KIND_ATTRIBUTE]: TranscriptRowKind;
  [key: string]: string;
}

export interface TranscriptShellBlockAttributes {
  [VIRTUAL_ROW_SHELL_BLOCK_ATTRIBUTE]: "true";
  [VIRTUAL_ROW_SHELL_BLOCK_KIND_ATTRIBUTE]: TranscriptShellBlockKind;
  [key: string]: string;
}
