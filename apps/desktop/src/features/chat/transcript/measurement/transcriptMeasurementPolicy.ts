import { applyCapabilityOverrides } from "./transcriptMeasurementPolicy/capabilityOverrides";
import { createEmptyCapabilities } from "./transcriptMeasurementPolicy/capabilities";
import { HARD_ESTIMATE_REASONS } from "./transcriptMeasurementPolicy/constants";
import { applyContentSafety } from "./transcriptMeasurementPolicy/contentSafety";
import {
  canMeasureReal,
  getKeepAlivePriority,
  requiresShellMeasurement,
} from "./transcriptMeasurementPolicy/policyDecision";
import { applyUiSafetyState } from "./transcriptMeasurementPolicy/uiSafety";
import type {
  Message,
  MessageContent,
  TranscriptMeasurementPolicy,
  TranscriptMeasurementPolicyDecision,
  TranscriptMeasurementPolicyInput,
  TranscriptMeasurementSafetyReason,
  TranscriptRowSafetyCapabilityOverride,
  TranscriptRowUiSafetyState,
} from "./transcriptMeasurementPolicy/types";

export type {
  TranscriptMeasurementPolicy,
  TranscriptLayoutPendingPolicy,
  TranscriptRowKind,
  TranscriptKeepAlivePriority,
  TranscriptMeasurementSafetyReason,
  TranscriptRowSafetyCapabilities,
  TranscriptRowSafetyCapabilityOverride,
  TranscriptRowUiSafetyState,
  TranscriptMeasurementPolicyOptions,
  TranscriptMeasurementPolicyInput,
  TranscriptMeasurementPolicyDecision,
} from "./transcriptMeasurementPolicy/types";

function isMessage(
  value: Message | readonly MessageContent[],
): value is Message {
  return !Array.isArray(value);
}

export function classifyMessageContentSafety(
  messageOrContent: Message | readonly MessageContent[],
  uiState?: TranscriptRowUiSafetyState,
  overrides?: TranscriptRowSafetyCapabilityOverride,
): Pick<
  TranscriptMeasurementPolicyDecision,
  "capabilities" | "layoutPendingPolicy" | "keepAlivePriority" | "reasons"
> {
  const message = isMessage(messageOrContent) ? messageOrContent : undefined;
  const content = isMessage(messageOrContent)
    ? messageOrContent.content
    : messageOrContent;
  const capabilities = createEmptyCapabilities();
  const reasons = new Set<TranscriptMeasurementSafetyReason>();

  applyContentSafety(capabilities, reasons, message, content);
  applyUiSafetyState(capabilities, reasons, uiState);
  applyCapabilityOverrides(capabilities, reasons, overrides);

  const layoutPendingPolicy =
    capabilities.hasPendingLayout || capabilities.hasDynamicAsyncLayout
      ? "requires-stable-descendants"
      : "can-finalize";

  return {
    capabilities,
    layoutPendingPolicy,
    keepAlivePriority: getKeepAlivePriority(capabilities, uiState),
    reasons: [...reasons],
  };
}

export function classifyTranscriptMeasurementPolicy(
  input: TranscriptMeasurementPolicyInput,
): TranscriptMeasurementPolicyDecision {
  const message = input.message;
  const content = input.content ?? message?.content ?? [];
  const capabilities = createEmptyCapabilities();
  const reasons = new Set<TranscriptMeasurementSafetyReason>();

  applyContentSafety(capabilities, reasons, message, content);
  applyUiSafetyState(capabilities, reasons, input.uiState);
  applyCapabilityOverrides(capabilities, reasons, input.capabilities);

  const layoutPendingPolicy =
    capabilities.hasPendingLayout || capabilities.hasDynamicAsyncLayout
      ? "requires-stable-descendants"
      : "can-finalize";
  const keepAlivePriority = getKeepAlivePriority(capabilities, input.uiState);
  const hasHardEstimateReason = HARD_ESTIMATE_REASONS.some((reason) =>
    reasons.has(reason),
  );
  const hasSideEffectFreeShell = input.options?.hasSideEffectFreeShell ?? true;

  let policy: TranscriptMeasurementPolicy;
  if (hasHardEstimateReason) {
    policy = "estimate-only";
  } else if (
    canMeasureReal(
      input.rowKind,
      message,
      content,
      capabilities,
      input.options,
      reasons,
    )
  ) {
    policy = "measure-real";
  } else if (
    hasSideEffectFreeShell &&
    requiresShellMeasurement(input.rowKind, content, capabilities)
  ) {
    policy = "measure-shell";
  } else {
    policy = "estimate-only";
  }

  capabilities.canOffscreenRenderReal = policy === "measure-real";
  capabilities.canOffscreenRenderShell = policy === "measure-shell";

  return {
    policy,
    layoutPendingPolicy,
    keepAlivePriority,
    capabilities,
    reasons: [...reasons],
  };
}
