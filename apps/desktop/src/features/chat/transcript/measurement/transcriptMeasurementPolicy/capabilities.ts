import { TERMINAL_TOOL_STATUSES } from "./constants";
import type {
  Message,
  MessageContent,
  ToolCallStatus,
  TranscriptMeasurementSafetyReason,
  TranscriptRowSafetyCapabilities,
} from "./types";

export function createEmptyCapabilities(): TranscriptRowSafetyCapabilities {
  return {
    stateful: false,
    hasMcpApp: false,
    hasHostCalls: false,
    hasHostActionHandlers: false,
    hasActiveTimer: false,
    hasActiveToolWork: false,
    hasActiveMcpHostRequest: false,
    hasActiveNestedToolRequest: false,
    hasDynamicAsyncLayout: false,
    hasPendingLayout: false,
    hasFocusedDescendant: false,
    hasOpenOverlay: false,
    hasOpenMenu: false,
    hasOpenDialog: false,
    hasOpenPopover: false,
    hasOpenLightbox: false,
    hasCopyFeedback: false,
    hasImageContent: false,
    hasToolContent: false,
    hasReasoningContent: false,
    hasActionRequired: false,
    hasStreamingContent: false,
    hasUnknownUnsafeDescendants: false,
    protectsSelection: false,
    canOffscreenRenderReal: false,
    canOffscreenRenderShell: false,
  };
}

export function addReason(
  reasons: Set<TranscriptMeasurementSafetyReason>,
  reason: TranscriptMeasurementSafetyReason,
): void {
  reasons.add(reason);
}

export function isActiveToolStatus(status: ToolCallStatus): boolean {
  return !TERMINAL_TOOL_STATUSES.has(status);
}

export function hasOnlyTextContent(content: readonly MessageContent[]): boolean {
  return content.length > 0 && content.every((block) => block.type === "text");
}

export function hasOnlySystemNotificationContent(
  content: readonly MessageContent[],
): boolean {
  return (
    content.length > 0 &&
    content.every((block) => block.type === "systemNotification")
  );
}

export function isMessage(
  value: Message | readonly MessageContent[],
): value is Message {
  return !Array.isArray(value);
}
