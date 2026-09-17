import {
  clearProtectionSignal,
  getNowMs,
  getOrCreateRowRecord,
  getWritableSession,
  setProtectionSignal,
} from "../sessionRecords";
import { omitCustomKey } from "../rowStateUpdaters";
import {
  DEFAULT_SOURCE_ID,
  type SessionRecord,
  type TranscriptSelectionProtectionInput,
} from "../types";

export function setSelectionProtection(
  sessions: Map<string, SessionRecord>,
  input: TranscriptSelectionProtectionInput,
): boolean {
  const nowMs = getNowMs(input.nowMs);
  if (!getWritableSession(sessions, input.sessionId, input.sessionEpoch)) {
    return false;
  }

  const sourceId = input.sourceId ?? DEFAULT_SOURCE_ID;
  for (const rowId of input.rowIds) {
    const record = getOrCreateRowRecord(
      sessions,
      {
        sessionId: input.sessionId,
        sessionEpoch: input.sessionEpoch,
        rowId,
      },
      nowMs,
    );
    if (!record) {
      continue;
    }

    if (input.active) {
      setProtectionSignal(record, {
        reason: "selection",
        sourceId,
        activatedAtMs: nowMs,
        updatedAtMs: nowMs,
      });
      record.state = {
        ...record.state,
        selectionProtected: true,
        custom: input.contextMenuOpen
          ? {
              ...record.state.custom,
              selectedTextContextMenuOpen: true,
            }
          : record.state.custom,
      };
    } else {
      clearProtectionSignal(record, "selection", sourceId);
      record.state = {
        ...record.state,
        selectionProtected: false,
        custom: input.contextMenuOpen
          ? record.state.custom
          : omitCustomKey(record.state.custom, "selectedTextContextMenuOpen"),
      };
    }
    record.updatedAtMs = nowMs;
  }

  return true;
}

export function clearSelectionProtection(
  sessions: Map<string, SessionRecord>,
  sessionId: string,
  sourceId: string,
): void {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  for (const record of session.rows.values()) {
    clearProtectionSignal(record, "selection", sourceId);
    record.state = {
      ...record.state,
      selectionProtected: false,
      custom: omitCustomKey(record.state.custom, "selectedTextContextMenuOpen"),
    };
  }
}
