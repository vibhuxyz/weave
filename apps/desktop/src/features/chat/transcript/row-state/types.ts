import type {
  TranscriptKeepAlivePriority,
  TranscriptRowDescriptor,
} from "@/features/chat/transcript/projection";

export type TranscriptRowProtectionReason =
  | "focused"
  | "selection"
  | "open-overlay"
  | "active-mcp"
  | "active-stream"
  | "recent";

export type TranscriptOpenOverlayKind =
  | "menu"
  | "dialog"
  | "popover"
  | "lightbox"
  | "context-menu"
  | "other";

export type TranscriptMcpActivityKind =
  | "host-request"
  | "nested-tool-request"
  | "recent-message"
  | "recent-resize";

export interface TranscriptKeepAlivePolicyOptions {
  activeStreamRowsPerSessionCap: number;
  mcpRowsPerSessionCap: number;
  recentRowsPerSessionCap: number;
  recentTtlMs: number;
  protectedRowsWarnThreshold: number;
  protectedRowsFailThreshold: number;
}

export const DEFAULT_TRANSCRIPT_KEEP_ALIVE_POLICY: TranscriptKeepAlivePolicyOptions =
  {
    // Active-stream rows are capped so a leaked or runaway stream signal cannot
    // accumulate past the fail threshold and disable windowing. Genuine
    // interaction rows (focused/selection/open-ui) remain protected without a
    // cap; the newest streams fill the bounded stream budget.
    activeStreamRowsPerSessionCap: 40,
    mcpRowsPerSessionCap: 8,
    recentRowsPerSessionCap: 20,
    recentTtlMs: 60_000,
    protectedRowsWarnThreshold: 40,
    protectedRowsFailThreshold: 80,
  };

export const TRANSCRIPT_KEEP_ALIVE_PRIORITY_WEIGHT: Record<
  TranscriptKeepAlivePriority,
  number
> = {
  none: 0,
  recent: 10,
  "active-mcp": 30,
  "active-stream": 40,
  "open-ui": 70,
  selection: 80,
  focused: 90,
};

export interface TranscriptToolChainRowState {
  chainExpanded?: boolean;
  showInternalSteps?: boolean;
  userInteracted?: boolean;
  expandedToolKeys?: readonly string[];
}

export interface TranscriptReasoningRowState {
  open?: boolean;
  userControlled?: boolean;
  autoCloseCompletedAtMs?: number;
  durationMs?: number;
}

export interface TranscriptMcpAppRowState {
  lifecycle?:
    | "visible"
    | "focused"
    | "active-host-request"
    | "recently-resized"
    | "recently-messaged"
    | "suspended"
    | "destroyed";
  inlineHeightPx?: number;
  activeHostRequestIds?: readonly string[];
  activeNestedToolRequestIds?: readonly string[];
  lastMessageAtMs?: number;
  lastResizeAtMs?: number;
}

export interface TranscriptOverlayRowState {
  openOverlayIds?: readonly string[];
  openMenuIds?: readonly string[];
  openDialogIds?: readonly string[];
  openPopoverIds?: readonly string[];
  openLightboxIds?: readonly string[];
}

export interface TranscriptDurableRowState {
  toolChain?: TranscriptToolChainRowState;
  toolChains?: Readonly<Record<string, TranscriptToolChainRowState>>;
  reasoning?: TranscriptReasoningRowState;
  reasoningBlocks?: Readonly<Record<string, TranscriptReasoningRowState>>;
  mcpApp?: TranscriptMcpAppRowState;
  pathNoticeText?: string;
  artifactOpenError?: string;
  moreOutputsOpen?: boolean;
  /**
   * Whether a clamped long user message has been expanded to full height.
   * Durable so expanding survives the row being recycled out of the
   * virtualized viewport and scrolled back into it.
   */
  userMessageExpanded?: boolean;
  userMessageExpandedBlocks?: Readonly<Record<string, boolean>>;
  copyConfirmedUntilMs?: number;
  embeddedScrollTopByKey?: Readonly<Record<string, number>>;
  activeFocusTargetId?: string;
  selectionProtected?: boolean;
  overlays?: TranscriptOverlayRowState;
  custom?: Readonly<Record<string, unknown>>;
}

export interface TranscriptRowStateLookupInput {
  sessionId: string;
  rowId: string;
  sessionEpoch?: number;
  nowMs?: number;
}

export interface TranscriptRowStateUpdateInput
  extends TranscriptRowStateLookupInput {
  markRecent?: boolean;
  updater: (
    current: Readonly<TranscriptDurableRowState>,
  ) => TranscriptDurableRowState;
}

export interface TranscriptRowStatePatchInput
  extends TranscriptRowStateLookupInput {
  markRecent?: boolean;
  patch: Partial<TranscriptDurableRowState>;
}

export interface TranscriptFocusProtectionInput
  extends TranscriptRowStateLookupInput {
  focused: boolean;
  sourceId?: string;
  focusTargetId?: string;
}

export interface TranscriptSelectionProtectionInput {
  sessionId: string;
  rowIds: readonly string[];
  active: boolean;
  sessionEpoch?: number;
  nowMs?: number;
  sourceId?: string;
  contextMenuOpen?: boolean;
}

export interface TranscriptOpenOverlayProtectionInput
  extends TranscriptRowStateLookupInput {
  open: boolean;
  overlayId?: string;
  overlayKind: TranscriptOpenOverlayKind;
}

export interface TranscriptMcpActivityInput
  extends TranscriptRowStateLookupInput {
  active: boolean;
  kind: TranscriptMcpActivityKind;
  sourceId?: string;
  ttlMs?: number;
}

export interface TranscriptActiveStreamInput
  extends TranscriptRowStateLookupInput {
  active: boolean;
  sourceId?: string;
}

export interface TranscriptRowInteractionInput
  extends TranscriptRowStateLookupInput {
  sourceId?: string;
  ttlMs?: number;
}

export interface TranscriptKeepAliveEvaluationInput {
  sessionId: string;
  sessionEpoch?: number;
  rows: readonly TranscriptRowDescriptor[];
  visibleRowIds?: Iterable<string>;
  nowMs?: number;
}

export interface TranscriptProtectedRowDiagnostic {
  rowId: string;
  priorities: readonly TranscriptKeepAlivePriority[];
  reasons: readonly TranscriptRowProtectionReason[];
  isVisible: boolean;
  protected: boolean;
  evicted: boolean;
  expiresAtMs?: number;
}

export interface TranscriptKeepAliveDiagnostics {
  sessionId: string;
  sessionEpoch: number;
  rowStateCount: number;
  protectedRowCount: number;
  protectedOffscreenRowCount: number;
  forcedProtectedRowCount: number;
  mcpProtectedRowCount: number;
  recentProtectedRowCount: number;
  mcpCandidateCount: number;
  recentCandidateCount: number;
  evictedMcpRowCount: number;
  evictedRecentRowCount: number;
  expiredSignalCount: number;
  warnThresholdExceeded: boolean;
  failThresholdExceeded: boolean;
  failThresholdJustifiedByActiveInteraction: boolean;
  policy: TranscriptKeepAlivePolicyOptions;
  rows: readonly TranscriptProtectedRowDiagnostic[];
}

export interface TranscriptKeepAliveDecision {
  protectedRowIds: readonly string[];
  protectedOffscreenRowIds: readonly string[];
  evictedRowIds: readonly string[];
  diagnostics: TranscriptKeepAliveDiagnostics;
}

export interface TranscriptSessionCleanupResult {
  sessionId: string;
  removedRowStateCount: number;
  removedProtectionSignalCount: number;
}

export interface TranscriptSessionPromotionResult {
  oldSessionId: string;
  newSessionId: string;
  promotedRowStateCount: number;
  promotedProtectionSignalCount: number;
  mergedIntoExistingSession: boolean;
}

export interface ProtectionSignal {
  reason: TranscriptRowProtectionReason;
  sourceId: string;
  activatedAtMs: number;
  updatedAtMs: number;
  expiresAtMs?: number;
}

export interface RowRecord {
  rowId: string;
  state: TranscriptDurableRowState;
  createdAtMs: number;
  updatedAtMs: number;
  lastAccessedAtMs: number;
  protectionSignals: Map<string, ProtectionSignal>;
}

export interface SessionRecord {
  sessionId: string;
  sessionEpoch: number;
  rows: Map<string, RowRecord>;
}

export interface Candidate {
  rowId: string;
  priorities: Set<TranscriptKeepAlivePriority>;
  reasons: Set<TranscriptRowProtectionReason>;
  activatedAtMs: number;
  updatedAtMs: number;
  expiresAtMs?: number;
}

export interface CandidateSelection {
  forced: readonly Candidate[];
  mcp: readonly Candidate[];
  recent: readonly Candidate[];
  evictedActiveStream: readonly Candidate[];
  evictedMcp: readonly Candidate[];
  evictedRecent: readonly Candidate[];
}

export const DEFAULT_SOURCE_ID = "default";

export function assertNever(value: never): never {
  throw new Error(`Unexpected transcript row-state value: ${String(value)}`);
}
