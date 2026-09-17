import {
  addReason,
  hasOnlySystemNotificationContent,
  hasOnlyTextContent,
} from "./capabilities";
import type {
  Message,
  MessageContent,
  TranscriptKeepAlivePriority,
  TranscriptMeasurementPolicyOptions,
  TranscriptMeasurementSafetyReason,
  TranscriptRowKind,
  TranscriptRowSafetyCapabilities,
  TranscriptRowUiSafetyState,
} from "./types";

export function getKeepAlivePriority(
  capabilities: TranscriptRowSafetyCapabilities,
  uiState: TranscriptRowUiSafetyState | undefined,
): TranscriptKeepAlivePriority {
  if (capabilities.hasFocusedDescendant) return "focused";
  if (capabilities.protectsSelection) return "selection";
  if (
    capabilities.hasOpenOverlay ||
    capabilities.hasOpenMenu ||
    capabilities.hasOpenDialog ||
    capabilities.hasOpenPopover ||
    capabilities.hasOpenLightbox ||
    capabilities.hasCopyFeedback
  ) {
    return "open-ui";
  }
  if (
    capabilities.hasActiveMcpHostRequest ||
    capabilities.hasActiveNestedToolRequest
  ) {
    return "active-mcp";
  }
  if (capabilities.hasActiveToolWork || capabilities.hasStreamingContent) {
    return "active-stream";
  }
  if (uiState?.hasRecentlyMcpResized || uiState?.hasRecentlyMcpMessaged) {
    return "recent";
  }
  return "none";
}

export function requiresShellMeasurement(
  rowKind: TranscriptRowKind,
  content: readonly MessageContent[],
  capabilities: TranscriptRowSafetyCapabilities,
): boolean {
  if (
    capabilities.stateful ||
    capabilities.hasMcpApp ||
    capabilities.hasHostCalls ||
    capabilities.hasHostActionHandlers ||
    capabilities.hasToolContent ||
    capabilities.hasImageContent ||
    capabilities.hasReasoningContent ||
    capabilities.hasActionRequired ||
    capabilities.hasDynamicAsyncLayout ||
    capabilities.hasPendingLayout
  ) {
    return true;
  }

  return rowKind === "message" && hasOnlyTextContent(content);
}

export function canMeasureReal(
  rowKind: TranscriptRowKind,
  message: Message | undefined,
  content: readonly MessageContent[],
  capabilities: TranscriptRowSafetyCapabilities,
  options: TranscriptMeasurementPolicyOptions | undefined,
  reasons: Set<TranscriptMeasurementSafetyReason>,
): boolean {
  if (rowKind === "date-separator" || rowKind === "top-loading-sentinel") {
    addReason(reasons, "date-separator");
    return true;
  }

  if (
    message?.role === "system" &&
    hasOnlySystemNotificationContent(content) &&
    !capabilities.hasDynamicAsyncLayout
  ) {
    addReason(reasons, "static-system-notice");
    return true;
  }

  if (
    rowKind === "assistant-content-fragment" &&
    options?.allowCompletedFragmentRealMeasurement !== false &&
    !requiresShellMeasurement(rowKind, content, capabilities)
  ) {
    addReason(reasons, "side-effect-free-fragment");
    return true;
  }

  if (
    options?.allowAuditedWholeTextRealMeasurement &&
    hasOnlyTextContent(content) &&
    !requiresShellMeasurement(rowKind, content, capabilities)
  ) {
    addReason(reasons, "audited-real-measurement");
    return true;
  }

  if (rowKind === "message" && hasOnlyTextContent(content)) {
    addReason(reasons, "text-row-requires-audit");
  }

  return false;
}
