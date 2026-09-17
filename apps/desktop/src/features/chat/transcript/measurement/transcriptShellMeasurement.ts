import { classifyTranscriptMeasurementPolicy } from "./transcriptMeasurementPolicy";
import {
  createContentShellBlock,
  createMetadataShellBlocks,
  getEstimatedBlockSize,
  getReservedBlockSize,
} from "./transcriptShellMeasurement/blockSizeEstimation";
import {
  canUseTranscriptShellMeasurement,
  createTranscriptShellBlockAttributes,
  createTranscriptShellRootAttributes,
} from "./transcriptShellMeasurement/shellAttributes";
import type {
  TranscriptShellMeasurementInput,
  TranscriptShellMeasurementPlan,
  TranscriptShellMeasurementStatus,
} from "./transcriptShellMeasurement/types";

export {
  VIRTUAL_ROW_MEASUREMENT_SHELL_ATTRIBUTE,
  VIRTUAL_ROW_SHELL_BLOCK_ATTRIBUTE,
  VIRTUAL_ROW_SHELL_BLOCK_KIND_ATTRIBUTE,
  VIRTUAL_ROW_SHELL_KIND_ATTRIBUTE,
} from "./transcriptShellMeasurement/types";
export type {
  TranscriptShellBlockAttributes,
  TranscriptShellBlockKind,
  TranscriptShellMeasurementBlock,
  TranscriptShellMeasurementInput,
  TranscriptShellMeasurementPlan,
  TranscriptShellMeasurementStatus,
  TranscriptShellRootAttributes,
} from "./transcriptShellMeasurement/types";
export {
  canUseTranscriptShellMeasurement,
  createTranscriptShellBlockAttributes,
  createTranscriptShellRootAttributes,
};

export function createTranscriptShellMeasurementPlan(
  input: TranscriptShellMeasurementInput,
): TranscriptShellMeasurementPlan {
  const policyDecision =
    input.policyDecision ?? classifyTranscriptMeasurementPolicy(input);
  const message = input.message;
  const content = input.content ?? message?.content ?? [];
  const blocks = [
    ...createMetadataShellBlocks(message),
    ...content.map(createContentShellBlock),
  ];
  const estimatedBlockSize = getEstimatedBlockSize({
    estimatedBlockSize: input.estimatedBlockSize,
    message,
    rowKind: input.rowKind,
    blocks,
  });
  const reservedBlockSize = getReservedBlockSize(blocks);

  let status: TranscriptShellMeasurementStatus;
  if (policyDecision.policy === "measure-shell") {
    status = "ready";
  } else if (policyDecision.policy === "estimate-only") {
    status = "blocked";
  } else {
    status = "not-eligible";
  }

  return {
    status,
    rowKind: input.rowKind,
    policyDecision,
    estimatedBlockSize,
    reservedBlockSize,
    blocks,
    reasons: policyDecision.reasons,
  };
}
