import type {
  Message,
  MessageContent,
  ToolCallStatus,
} from "@/shared/types/messages";

export type TranscriptMeasurementPolicy =
  | "measure-real"
  | "measure-shell"
  | "estimate-only";

export type TranscriptLayoutPendingPolicy =
  | "can-finalize"
  | "requires-stable-descendants";

export type TranscriptRowKind =
  | "date-separator"
  | "message"
  | "assistant-message-chrome"
  | "assistant-content-fragment"
  | "assistant-message-actions"
  | "agent-work"
  | "top-loading-sentinel";

export type TranscriptKeepAlivePriority =
  | "none"
  | "focused"
  | "selection"
  | "open-ui"
  | "active-mcp"
  | "active-stream"
  | "recent";

export type TranscriptMeasurementSafetyReason =
  | "active-copy-feedback"
  | "active-mcp-host-work"
  | "active-nested-tool-request"
  | "active-selection"
  | "active-stream"
  | "active-timer"
  | "active-tool"
  | "action-required"
  | "async-code-highlighting"
  | "audited-real-measurement"
  | "date-separator"
  | "dynamic-async-layout"
  | "focused-row"
  | "host-calls"
  | "host-action-handlers"
  | "image-content"
  | "layout-animation"
  | "layout-pending"
  | "mcp-app"
  | "open-overlay"
  | "reasoning-or-thinking"
  | "side-effect-free-fragment"
  | "static-system-notice"
  | "stateful-row"
  | "text-row-requires-audit"
  | "tool-content"
  | "unknown-unsafe-descendant";

export interface TranscriptRowSafetyCapabilities {
  stateful: boolean;
  hasMcpApp: boolean;
  hasHostCalls: boolean;
  hasHostActionHandlers: boolean;
  hasActiveTimer: boolean;
  hasActiveToolWork: boolean;
  hasActiveMcpHostRequest: boolean;
  hasActiveNestedToolRequest: boolean;
  hasDynamicAsyncLayout: boolean;
  hasPendingLayout: boolean;
  hasFocusedDescendant: boolean;
  hasOpenOverlay: boolean;
  hasOpenMenu: boolean;
  hasOpenDialog: boolean;
  hasOpenPopover: boolean;
  hasOpenLightbox: boolean;
  hasCopyFeedback: boolean;
  hasImageContent: boolean;
  hasToolContent: boolean;
  hasReasoningContent: boolean;
  hasActionRequired: boolean;
  hasStreamingContent: boolean;
  hasUnknownUnsafeDescendants: boolean;
  protectsSelection: boolean;
  canOffscreenRenderReal: boolean;
  canOffscreenRenderShell: boolean;
}

export type TranscriptRowSafetyCapabilityOverride = Partial<
  Omit<
    TranscriptRowSafetyCapabilities,
    "canOffscreenRenderReal" | "canOffscreenRenderShell"
  >
>;

export interface TranscriptRowUiSafetyState {
  hasFocusedDescendant?: boolean;
  protectsSelection?: boolean;
  hasOpenOverlay?: boolean;
  hasOpenMenu?: boolean;
  hasOpenDialog?: boolean;
  hasOpenPopover?: boolean;
  hasOpenLightbox?: boolean;
  hasCopyFeedback?: boolean;
  hasActiveMcpHostRequest?: boolean;
  hasActiveNestedToolRequest?: boolean;
  hasActiveTimer?: boolean;
  hasActiveToolWork?: boolean;
  hasPendingLayout?: boolean;
  hasLayoutAnimation?: boolean;
  hasDynamicAsyncLayout?: boolean;
  hasAsyncCodeHighlighting?: boolean;
  hasRecentlyMcpResized?: boolean;
  hasRecentlyMcpMessaged?: boolean;
  hasUnknownUnsafeDescendants?: boolean;
}

export interface TranscriptMeasurementPolicyOptions {
  allowAuditedWholeTextRealMeasurement?: boolean;
  allowCompletedFragmentRealMeasurement?: boolean;
  hasSideEffectFreeShell?: boolean;
}

export interface TranscriptMeasurementPolicyInput {
  rowKind: TranscriptRowKind;
  message?: Message;
  content?: readonly MessageContent[];
  uiState?: TranscriptRowUiSafetyState;
  capabilities?: TranscriptRowSafetyCapabilityOverride;
  options?: TranscriptMeasurementPolicyOptions;
}

export interface TranscriptMeasurementPolicyDecision {
  policy: TranscriptMeasurementPolicy;
  layoutPendingPolicy: TranscriptLayoutPendingPolicy;
  keepAlivePriority: TranscriptKeepAlivePriority;
  capabilities: TranscriptRowSafetyCapabilities;
  reasons: readonly TranscriptMeasurementSafetyReason[];
}

export type { Message, MessageContent, ToolCallStatus };
