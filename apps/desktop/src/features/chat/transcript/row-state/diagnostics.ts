import { comparePriority, uniqueSortedRowIds } from "./candidateSelection";
import type {
  Candidate,
  CandidateSelection,
  SessionRecord,
  TranscriptKeepAliveDiagnostics,
  TranscriptKeepAlivePolicyOptions,
} from "./types";

export function buildDiagnostics(input: {
  sessionId: string;
  sessionEpoch: number;
  rowStateCount: number;
  visibleRowIds: ReadonlySet<string>;
  candidates: readonly Candidate[];
  selection: CandidateSelection;
  protectedRowIds: readonly string[];
  protectedOffscreenRowIds: readonly string[];
  expiredSignalCount: number;
  policy: TranscriptKeepAlivePolicyOptions;
}): TranscriptKeepAliveDiagnostics {
  const protectedRowIdSet = new Set(input.protectedRowIds);
  const evictedRowIdSet = new Set(
    uniqueSortedRowIds([
      ...input.selection.evictedActiveStream,
      ...input.selection.evictedMcp,
      ...input.selection.evictedRecent,
    ]),
  );
  const protectedRows = input.candidates.map((candidate) => ({
    rowId: candidate.rowId,
    priorities: [...candidate.priorities].sort(comparePriority),
    reasons: [...candidate.reasons].sort(),
    isVisible: input.visibleRowIds.has(candidate.rowId),
    protected: protectedRowIdSet.has(candidate.rowId),
    evicted: evictedRowIdSet.has(candidate.rowId),
    expiresAtMs: candidate.expiresAtMs,
  }));
  const hasActiveInteractionExemption = input.candidates.some(
    (candidate) =>
      protectedRowIdSet.has(candidate.rowId) &&
      (candidate.priorities.has("focused") ||
        candidate.priorities.has("selection") ||
        candidate.priorities.has("open-ui")),
  );
  const exceedsFailThreshold =
    input.protectedRowIds.length > input.policy.protectedRowsFailThreshold;

  return {
    sessionId: input.sessionId,
    sessionEpoch: input.sessionEpoch,
    rowStateCount: input.rowStateCount,
    protectedRowCount: input.protectedRowIds.length,
    protectedOffscreenRowCount: input.protectedOffscreenRowIds.length,
    forcedProtectedRowCount: input.selection.forced.length,
    mcpProtectedRowCount: input.selection.mcp.length,
    recentProtectedRowCount: input.selection.recent.length,
    mcpCandidateCount:
      input.selection.mcp.length + input.selection.evictedMcp.length,
    recentCandidateCount:
      input.selection.recent.length + input.selection.evictedRecent.length,
    evictedMcpRowCount: input.selection.evictedMcp.length,
    evictedRecentRowCount: input.selection.evictedRecent.length,
    expiredSignalCount: input.expiredSignalCount,
    warnThresholdExceeded:
      input.protectedRowIds.length > input.policy.protectedRowsWarnThreshold,
    failThresholdExceeded:
      exceedsFailThreshold && !hasActiveInteractionExemption,
    failThresholdJustifiedByActiveInteraction:
      exceedsFailThreshold && hasActiveInteractionExemption,
    policy: input.policy,
    rows: protectedRows,
  };
}

export function countProtectionSignals(session: SessionRecord): number {
  let count = 0;
  for (const record of session.rows.values()) {
    count += record.protectionSignals.size;
  }
  return count;
}
