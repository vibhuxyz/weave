import { buildDiagnostics, countProtectionSignals } from "./diagnostics";
import { selectCandidates } from "./candidateSelection";
import { uniqueSortedRowIds } from "./candidateSelection";
import {
  collectCandidates,
  getNowMs,
  getWritableSession,
  promoteStoredDiagnostics,
  pruneExpiredSignals,
} from "./sessionRecords";
import {
  type SessionRecord,
  type TranscriptKeepAliveDecision,
  type TranscriptKeepAliveDiagnostics,
  type TranscriptKeepAliveEvaluationInput,
  type TranscriptKeepAlivePolicyOptions,
  type TranscriptSessionCleanupResult,
  type TranscriptSessionPromotionResult,
} from "./types";

export function evaluateKeepAlive(
  sessions: Map<string, SessionRecord>,
  lastDiagnosticsBySession: Map<string, TranscriptKeepAliveDiagnostics>,
  policy: TranscriptKeepAlivePolicyOptions,
  input: TranscriptKeepAliveEvaluationInput,
): TranscriptKeepAliveDecision {
  const nowMs = getNowMs(input.nowMs);
  const session = getWritableSession(
    sessions,
    input.sessionId,
    input.sessionEpoch,
  );
  const visibleRowIds = new Set(input.visibleRowIds ?? []);
  const expiredSignalCount = session ? pruneExpiredSignals(session, nowMs) : 0;
  const candidates = collectCandidates(session, input.rows, nowMs);
  const selection = selectCandidates(candidates, policy);
  const protectedCandidates = [
    ...selection.forced,
    ...selection.mcp,
    ...selection.recent,
  ];
  const evictedCandidates = [
    ...selection.evictedActiveStream,
    ...selection.evictedMcp,
    ...selection.evictedRecent,
  ];
  const protectedRowIds = uniqueSortedRowIds(protectedCandidates);
  const evictedRowIds = uniqueSortedRowIds(evictedCandidates);
  const protectedOffscreenRowIds = protectedRowIds.filter(
    (rowId) => !visibleRowIds.has(rowId),
  );
  const diagnostics = buildDiagnostics({
    sessionId: input.sessionId,
    sessionEpoch: session?.sessionEpoch ?? input.sessionEpoch ?? 0,
    rowStateCount: session?.rows.size ?? 0,
    visibleRowIds,
    candidates,
    selection,
    protectedRowIds,
    protectedOffscreenRowIds,
    expiredSignalCount,
    policy,
  });

  lastDiagnosticsBySession.set(input.sessionId, diagnostics);
  return {
    protectedRowIds,
    protectedOffscreenRowIds,
    evictedRowIds,
    diagnostics,
  };
}

export function cleanupExpired(
  sessions: Map<string, SessionRecord>,
  nowMs: number,
): number {
  let expiredSignalCount = 0;
  for (const session of sessions.values()) {
    expiredSignalCount += pruneExpiredSignals(session, nowMs);
  }
  return expiredSignalCount;
}

export function cleanupSession(
  sessions: Map<string, SessionRecord>,
  lastDiagnosticsBySession: Map<string, TranscriptKeepAliveDiagnostics>,
  sessionId: string,
): TranscriptSessionCleanupResult {
  const session = sessions.get(sessionId);
  if (!session) {
    return {
      sessionId,
      removedRowStateCount: 0,
      removedProtectionSignalCount: 0,
    };
  }

  const removedProtectionSignalCount = countProtectionSignals(session);
  const removedRowStateCount = session.rows.size;
  sessions.delete(sessionId);
  lastDiagnosticsBySession.delete(sessionId);
  return {
    sessionId,
    removedRowStateCount,
    removedProtectionSignalCount,
  };
}

export function promoteSession(
  sessions: Map<string, SessionRecord>,
  lastDiagnosticsBySession: Map<string, TranscriptKeepAliveDiagnostics>,
  oldSessionId: string,
  newSessionId: string,
  options: { newSessionEpoch?: number } = {},
): TranscriptSessionPromotionResult {
  const source = sessions.get(oldSessionId);
  if (!source) {
    return {
      oldSessionId,
      newSessionId,
      promotedRowStateCount: 0,
      promotedProtectionSignalCount: 0,
      mergedIntoExistingSession: sessions.has(newSessionId),
    };
  }

  const promotedRowStateCount = source.rows.size;
  const promotedProtectionSignalCount = countProtectionSignals(source);
  const target = sessions.get(newSessionId);
  if (!target) {
    sessions.delete(oldSessionId);
    sessions.set(newSessionId, {
      sessionId: newSessionId,
      sessionEpoch: options.newSessionEpoch ?? source.sessionEpoch,
      rows: source.rows,
    });
    promoteStoredDiagnostics(
      lastDiagnosticsBySession,
      oldSessionId,
      newSessionId,
    );
    return {
      oldSessionId,
      newSessionId,
      promotedRowStateCount,
      promotedProtectionSignalCount,
      mergedIntoExistingSession: false,
    };
  }

  for (const [rowId, record] of source.rows) {
    if (!target.rows.has(rowId)) {
      target.rows.set(rowId, record);
    }
  }
  target.sessionEpoch = options.newSessionEpoch ?? target.sessionEpoch;
  sessions.delete(oldSessionId);
  lastDiagnosticsBySession.delete(oldSessionId);
  return {
    oldSessionId,
    newSessionId,
    promotedRowStateCount,
    promotedProtectionSignalCount,
    mergedIntoExistingSession: true,
  };
}
