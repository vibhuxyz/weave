import type { TranscriptRowDescriptor } from "@/features/chat/transcript/projection";
import { priorityForReason, reasonForPriority, upsertCandidate } from "./candidateSelection";
import {
  type Candidate,
  type ProtectionSignal,
  type RowRecord,
  type SessionRecord,
  type TranscriptKeepAliveDiagnostics,
  type TranscriptRowProtectionReason,
  type TranscriptRowStateLookupInput,
} from "./types";

export function getNowMs(nowMs?: number): number {
  return nowMs ?? globalThis.performance?.now() ?? Date.now();
}

export function getSignalKey(
  reason: TranscriptRowProtectionReason,
  sourceId: string,
): string {
  return `${reason}:${sourceId}`;
}

export function getReadableSession(
  sessions: Map<string, SessionRecord>,
  input: Pick<TranscriptRowStateLookupInput, "sessionId" | "sessionEpoch">,
): SessionRecord | undefined {
  const session = sessions.get(input.sessionId);
  if (!session) {
    return undefined;
  }
  if (
    input.sessionEpoch !== undefined &&
    input.sessionEpoch < session.sessionEpoch
  ) {
    return undefined;
  }
  return session;
}

export function getWritableSession(
  sessions: Map<string, SessionRecord>,
  sessionId: string,
  sessionEpoch: number | undefined,
): SessionRecord | undefined {
  const session = getOrCreateSession(sessions, sessionId, sessionEpoch);
  if (sessionEpoch !== undefined && sessionEpoch < session.sessionEpoch) {
    return undefined;
  }
  if (sessionEpoch !== undefined && sessionEpoch > session.sessionEpoch) {
    session.sessionEpoch = sessionEpoch;
  }
  return session;
}

export function getOrCreateSession(
  sessions: Map<string, SessionRecord>,
  sessionId: string,
  sessionEpoch: number | undefined,
): SessionRecord {
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const session: SessionRecord = {
    sessionId,
    sessionEpoch: sessionEpoch ?? 0,
    rows: new Map(),
  };
  sessions.set(sessionId, session);
  return session;
}

export function getOrCreateRowRecord(
  sessions: Map<string, SessionRecord>,
  input: TranscriptRowStateLookupInput,
  nowMs: number,
): RowRecord | undefined {
  const session = getWritableSession(
    sessions,
    input.sessionId,
    input.sessionEpoch,
  );
  if (!session) {
    return undefined;
  }

  const existing = session.rows.get(input.rowId);
  if (existing) {
    return existing;
  }

  const record: RowRecord = {
    rowId: input.rowId,
    state: {},
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    lastAccessedAtMs: nowMs,
    protectionSignals: new Map(),
  };
  session.rows.set(input.rowId, record);
  return record;
}

export function setProtectionSignal(
  record: RowRecord,
  signal: ProtectionSignal,
): void {
  const key = getSignalKey(signal.reason, signal.sourceId);
  const existing = record.protectionSignals.get(key);
  record.protectionSignals.set(key, {
    ...signal,
    activatedAtMs: existing?.activatedAtMs ?? signal.activatedAtMs,
  });
}

export function clearProtectionSignal(
  record: RowRecord,
  reason: TranscriptRowProtectionReason,
  sourceId: string,
): void {
  record.protectionSignals.delete(getSignalKey(reason, sourceId));
}

export function pruneExpiredSignals(
  session: SessionRecord,
  nowMs: number,
): number {
  let expiredSignalCount = 0;
  for (const record of session.rows.values()) {
    for (const [key, signal] of record.protectionSignals) {
      if (signal.expiresAtMs !== undefined && signal.expiresAtMs <= nowMs) {
        record.protectionSignals.delete(key);
        expiredSignalCount += 1;
      }
    }
  }
  return expiredSignalCount;
}

export function collectCandidates(
  session: SessionRecord | undefined,
  rows: readonly TranscriptRowDescriptor[],
  nowMs: number,
): readonly Candidate[] {
  const candidates = new Map<string, Candidate>();

  if (session) {
    for (const record of session.rows.values()) {
      for (const signal of record.protectionSignals.values()) {
        const priority = priorityForReason(signal.reason);
        upsertCandidate(candidates, {
          rowId: record.rowId,
          priority,
          reason: signal.reason,
          activatedAtMs: signal.activatedAtMs,
          updatedAtMs: signal.updatedAtMs,
          expiresAtMs: signal.expiresAtMs,
        });
      }
    }
  }

  for (const [rowIndex, row] of rows.entries()) {
    if (row.keepAlivePriority === "none") {
      continue;
    }
    // Projection-only active rows share one evaluation timestamp. Preserve
    // transcript order as their recency tie-breaker so the bounded stream
    // budget keeps the live tail instead of lexicographically smallest IDs.
    const projectionOrderMs = nowMs + rowIndex;
    upsertCandidate(candidates, {
      rowId: row.rowId,
      priority: row.keepAlivePriority,
      reason: reasonForPriority(row.keepAlivePriority),
      activatedAtMs: projectionOrderMs,
      updatedAtMs: projectionOrderMs,
    });
  }

  return [...candidates.values()];
}

export function promoteStoredDiagnostics(
  lastDiagnosticsBySession: Map<string, TranscriptKeepAliveDiagnostics>,
  oldSessionId: string,
  newSessionId: string,
): void {
  const diagnostics = lastDiagnosticsBySession.get(oldSessionId);
  if (!diagnostics) {
    return;
  }
  lastDiagnosticsBySession.delete(oldSessionId);
  lastDiagnosticsBySession.set(newSessionId, {
    ...diagnostics,
    sessionId: newSessionId,
  });
}
