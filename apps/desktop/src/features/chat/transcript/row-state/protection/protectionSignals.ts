import {
  clearProtectionSignal,
  getNowMs,
  getOrCreateRowRecord,
  setProtectionSignal,
} from "../sessionRecords";
import {
  isExpiringMcpActivity,
  updateMcpState,
  updateOverlayState,
} from "../rowStateUpdaters";
import {
  DEFAULT_SOURCE_ID,
  type SessionRecord,
  type TranscriptActiveStreamInput,
  type TranscriptFocusProtectionInput,
  type TranscriptKeepAlivePolicyOptions,
  type TranscriptMcpActivityInput,
  type TranscriptOpenOverlayProtectionInput,
  type TranscriptRowInteractionInput,
} from "../types";

export function setFocusedRow(
  sessions: Map<string, SessionRecord>,
  input: TranscriptFocusProtectionInput,
): boolean {
  const nowMs = getNowMs(input.nowMs);
  const record = getOrCreateRowRecord(sessions, input, nowMs);
  if (!record) {
    return false;
  }

  const sourceId = input.sourceId ?? DEFAULT_SOURCE_ID;
  if (input.focused) {
    setProtectionSignal(record, {
      reason: "focused",
      sourceId,
      activatedAtMs: nowMs,
      updatedAtMs: nowMs,
    });
    record.state = {
      ...record.state,
      activeFocusTargetId: input.focusTargetId,
    };
  } else {
    clearProtectionSignal(record, "focused", sourceId);
    if (
      input.focusTargetId === undefined ||
      record.state.activeFocusTargetId === input.focusTargetId
    ) {
      record.state = {
        ...record.state,
        activeFocusTargetId: undefined,
      };
    }
  }
  record.updatedAtMs = nowMs;
  return true;
}

export function setOpenOverlay(
  sessions: Map<string, SessionRecord>,
  input: TranscriptOpenOverlayProtectionInput,
): boolean {
  const nowMs = getNowMs(input.nowMs);
  const record = getOrCreateRowRecord(sessions, input, nowMs);
  if (!record) {
    return false;
  }

  const overlayId = input.overlayId ?? DEFAULT_SOURCE_ID;
  const sourceId = `${input.overlayKind}:${overlayId}`;
  if (input.open) {
    setProtectionSignal(record, {
      reason: "open-overlay",
      sourceId,
      activatedAtMs: nowMs,
      updatedAtMs: nowMs,
    });
  } else {
    clearProtectionSignal(record, "open-overlay", sourceId);
  }
  record.state = {
    ...record.state,
    overlays: updateOverlayState(
      record.state.overlays,
      input.overlayKind,
      overlayId,
      input.open,
    ),
  };
  record.updatedAtMs = nowMs;
  return true;
}

export function setMcpActivity(
  sessions: Map<string, SessionRecord>,
  policy: TranscriptKeepAlivePolicyOptions,
  input: TranscriptMcpActivityInput,
): boolean {
  const nowMs = getNowMs(input.nowMs);
  const record = getOrCreateRowRecord(sessions, input, nowMs);
  if (!record) {
    return false;
  }

  const sourceId = input.sourceId ?? input.kind;
  const expiresAtMs = isExpiringMcpActivity(input.kind)
    ? nowMs + (input.ttlMs ?? policy.recentTtlMs)
    : undefined;
  if (input.active) {
    setProtectionSignal(record, {
      reason: "active-mcp",
      sourceId,
      activatedAtMs: nowMs,
      updatedAtMs: nowMs,
      expiresAtMs,
    });
  } else {
    clearProtectionSignal(record, "active-mcp", sourceId);
  }
  record.state = {
    ...record.state,
    mcpApp: updateMcpState(
      record.state.mcpApp,
      input.kind,
      input.active,
      nowMs,
      sourceId,
    ),
  };
  record.updatedAtMs = nowMs;
  return true;
}

export function setActiveStreamingRow(
  sessions: Map<string, SessionRecord>,
  input: TranscriptActiveStreamInput,
): boolean {
  const nowMs = getNowMs(input.nowMs);
  const record = getOrCreateRowRecord(sessions, input, nowMs);
  if (!record) {
    return false;
  }

  const sourceId = input.sourceId ?? DEFAULT_SOURCE_ID;
  if (input.active) {
    setProtectionSignal(record, {
      reason: "active-stream",
      sourceId,
      activatedAtMs: nowMs,
      updatedAtMs: nowMs,
    });
  } else {
    clearProtectionSignal(record, "active-stream", sourceId);
  }
  record.updatedAtMs = nowMs;
  return true;
}

export function markRowInteracted(
  sessions: Map<string, SessionRecord>,
  policy: TranscriptKeepAlivePolicyOptions,
  input: TranscriptRowInteractionInput,
): boolean {
  const nowMs = getNowMs(input.nowMs);
  const record = getOrCreateRowRecord(sessions, input, nowMs);
  if (!record) {
    return false;
  }

  setProtectionSignal(record, {
    reason: "recent",
    sourceId: input.sourceId ?? DEFAULT_SOURCE_ID,
    activatedAtMs: nowMs,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + (input.ttlMs ?? policy.recentTtlMs),
  });
  record.updatedAtMs = nowMs;
  return true;
}
