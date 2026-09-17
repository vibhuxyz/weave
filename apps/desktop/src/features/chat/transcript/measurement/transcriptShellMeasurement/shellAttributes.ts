import { createVirtualReservedBlockSizeAttributes } from "../transcriptLayoutPending";
import {
  VIRTUAL_ROW_MEASUREMENT_SHELL_ATTRIBUTE,
  VIRTUAL_ROW_SHELL_BLOCK_ATTRIBUTE,
  VIRTUAL_ROW_SHELL_BLOCK_KIND_ATTRIBUTE,
  VIRTUAL_ROW_SHELL_KIND_ATTRIBUTE,
} from "./types";
import type {
  TranscriptShellBlockAttributes,
  TranscriptShellMeasurementBlock,
  TranscriptShellMeasurementPlan,
  TranscriptShellRootAttributes,
} from "./types";

export function canUseTranscriptShellMeasurement(
  plan: TranscriptShellMeasurementPlan,
): boolean {
  return plan.status === "ready";
}

export function createTranscriptShellRootAttributes(
  plan: TranscriptShellMeasurementPlan,
): TranscriptShellRootAttributes | Record<string, never> {
  if (!canUseTranscriptShellMeasurement(plan)) {
    return {};
  }

  return {
    [VIRTUAL_ROW_MEASUREMENT_SHELL_ATTRIBUTE]: "true",
    [VIRTUAL_ROW_SHELL_KIND_ATTRIBUTE]: plan.rowKind,
    ...(plan.reservedBlockSize !== null
      ? createVirtualReservedBlockSizeAttributes({
          blockSize: plan.reservedBlockSize,
        })
      : {}),
  };
}

export function createTranscriptShellBlockAttributes(
  block: TranscriptShellMeasurementBlock,
): TranscriptShellBlockAttributes {
  return {
    [VIRTUAL_ROW_SHELL_BLOCK_ATTRIBUTE]: "true",
    [VIRTUAL_ROW_SHELL_BLOCK_KIND_ATTRIBUTE]: block.kind,
    ...(block.reservedBlockSize !== undefined
      ? createVirtualReservedBlockSizeAttributes({
          blockSize: block.reservedBlockSize,
        })
      : {}),
  };
}
