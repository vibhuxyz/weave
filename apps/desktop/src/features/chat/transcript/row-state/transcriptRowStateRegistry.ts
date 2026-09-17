import {
  cleanupExpired,
  cleanupSession,
  evaluateKeepAlive,
  promoteSession,
} from "./keepAliveLifecycle";
import {
  clearSelectionProtection,
  markRowInteracted,
  setActiveStreamingRow,
  setFocusedRow,
  setMcpActivity,
  setOpenOverlay,
  setSelectionProtection,
} from "./protection";
import { setProtectionSignal } from "./sessionRecords";
import {
  getNowMs,
  getOrCreateRowRecord,
  getOrCreateSession,
  getReadableSession,
} from "./sessionRecords";
import {
  DEFAULT_SOURCE_ID,
  DEFAULT_TRANSCRIPT_KEEP_ALIVE_POLICY,
  type SessionRecord,
  type TranscriptActiveStreamInput,
  type TranscriptDurableRowState,
  type TranscriptFocusProtectionInput,
  type TranscriptKeepAliveDecision,
  type TranscriptKeepAliveDiagnostics,
  type TranscriptKeepAliveEvaluationInput,
  type TranscriptKeepAlivePolicyOptions,
  type TranscriptMcpActivityInput,
  type TranscriptOpenOverlayProtectionInput,
  type TranscriptRowInteractionInput,
  type TranscriptRowStateLookupInput,
  type TranscriptRowStatePatchInput,
  type TranscriptRowStateUpdateInput,
  type TranscriptSelectionProtectionInput,
  type TranscriptSessionCleanupResult,
  type TranscriptSessionPromotionResult,
} from "./types";

export class TranscriptRowStateRegistry {
  private sessions = new Map<string, SessionRecord>();
  private lastDiagnosticsBySession = new Map<
    string,
    TranscriptKeepAliveDiagnostics
  >();
  private readonly policy: TranscriptKeepAlivePolicyOptions;
  private readonly stateChangeListeners = new Set<() => void>();

  constructor(policy: Partial<TranscriptKeepAlivePolicyOptions> = {}) {
    this.policy = {
      ...DEFAULT_TRANSCRIPT_KEEP_ALIVE_POLICY,
      ...policy,
    };
  }

  setSessionEpoch(sessionId: string, sessionEpoch: number): void {
    const session = getOrCreateSession(this.sessions, sessionId, sessionEpoch);
    session.sessionEpoch = sessionEpoch;
  }

  getOrCreateRowState(
    input: TranscriptRowStateLookupInput,
  ): TranscriptDurableRowState | undefined {
    const nowMs = getNowMs(input.nowMs);
    const record = getOrCreateRowRecord(this.sessions, input, nowMs);
    if (!record) {
      return undefined;
    }
    record.lastAccessedAtMs = nowMs;
    return record.state;
  }

  getRowState(
    input: TranscriptRowStateLookupInput,
  ): TranscriptDurableRowState | undefined {
    const session = getReadableSession(this.sessions, input);
    if (!session) {
      return undefined;
    }
    const record = session.rows.get(input.rowId);
    if (!record) {
      return undefined;
    }
    record.lastAccessedAtMs = getNowMs(input.nowMs);
    return record.state;
  }

  updateRowState(
    input: TranscriptRowStateUpdateInput,
  ): TranscriptDurableRowState | undefined {
    const nowMs = getNowMs(input.nowMs);
    const record = getOrCreateRowRecord(this.sessions, input, nowMs);
    if (!record) {
      return undefined;
    }

    record.state = input.updater(record.state);
    record.updatedAtMs = nowMs;
    record.lastAccessedAtMs = nowMs;

    if (input.markRecent ?? true) {
      setProtectionSignal(record, {
        reason: "recent",
        sourceId: "row-state-update",
        activatedAtMs: nowMs,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + this.policy.recentTtlMs,
      });
    }

    this.notifyStateChange();
    return record.state;
  }

  subscribeToStateChanges(callback: () => void): () => void {
    this.stateChangeListeners.add(callback);
    return () => {
      this.stateChangeListeners.delete(callback);
    };
  }

  private notifyStateChange(): void {
    for (const cb of this.stateChangeListeners) {
      cb();
    }
  }

  patchRowState(
    input: TranscriptRowStatePatchInput,
  ): TranscriptDurableRowState | undefined {
    return this.updateRowState({
      sessionId: input.sessionId,
      rowId: input.rowId,
      sessionEpoch: input.sessionEpoch,
      nowMs: input.nowMs,
      markRecent: input.markRecent,
      updater: (current) => ({ ...current, ...input.patch }),
    });
  }

  setFocusedRow(input: TranscriptFocusProtectionInput): boolean {
    return setFocusedRow(this.sessions, input);
  }

  setSelectionProtection(input: TranscriptSelectionProtectionInput): boolean {
    return setSelectionProtection(this.sessions, input);
  }

  clearSelectionProtection(
    sessionId: string,
    sourceId: string = DEFAULT_SOURCE_ID,
  ): void {
    clearSelectionProtection(this.sessions, sessionId, sourceId);
  }

  setOpenOverlay(input: TranscriptOpenOverlayProtectionInput): boolean {
    return setOpenOverlay(this.sessions, input);
  }

  setMcpActivity(input: TranscriptMcpActivityInput): boolean {
    return setMcpActivity(this.sessions, this.policy, input);
  }

  setActiveStreamingRow(input: TranscriptActiveStreamInput): boolean {
    return setActiveStreamingRow(this.sessions, input);
  }

  markRowInteracted(input: TranscriptRowInteractionInput): boolean {
    return markRowInteracted(this.sessions, this.policy, input);
  }

  evaluateKeepAlive(
    input: TranscriptKeepAliveEvaluationInput,
  ): TranscriptKeepAliveDecision {
    return evaluateKeepAlive(
      this.sessions,
      this.lastDiagnosticsBySession,
      this.policy,
      input,
    );
  }

  cleanupExpired(nowMs: number = getNowMs()): number {
    return cleanupExpired(this.sessions, nowMs);
  }

  cleanupSession(sessionId: string): TranscriptSessionCleanupResult {
    return cleanupSession(
      this.sessions,
      this.lastDiagnosticsBySession,
      sessionId,
    );
  }

  promoteSession(
    oldSessionId: string,
    newSessionId: string,
    options: { newSessionEpoch?: number } = {},
  ): TranscriptSessionPromotionResult {
    return promoteSession(
      this.sessions,
      this.lastDiagnosticsBySession,
      oldSessionId,
      newSessionId,
      options,
    );
  }

  getDiagnostics(
    sessionId: string,
  ): TranscriptKeepAliveDiagnostics | undefined {
    return this.lastDiagnosticsBySession.get(sessionId);
  }
}

export function createTranscriptRowStateRegistry(
  policy?: Partial<TranscriptKeepAlivePolicyOptions>,
): TranscriptRowStateRegistry {
  return new TranscriptRowStateRegistry(policy);
}
