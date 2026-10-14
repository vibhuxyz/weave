import type { DatabaseSync } from "node:sqlite";
import type { StorageResult, ThreadSeatRecord, ThreadTurnInput, ThreadTurnPage, ThreadTurnRecord } from "../types.ts";
import { integerField, isRow, isoFromMs, stringField } from "./rows.ts";
import { inTransaction } from "./transaction.ts";

const THREAD_IN_PROJECT = "SELECT 1 FROM sessions WHERE id = ? AND project_id = ?";

function toSeat(row: unknown): ThreadSeatRecord | null {
  if (!isRow(row)) return null;
  return {
    engineId: stringField(row, "engine_id"),
    engineSessionId: stringField(row, "engine_session_id"),
    syncedTurnSeq: integerField(row, "synced_turn_seq"),
  };
}

function toTurn(row: unknown): ThreadTurnRecord | null {
  if (!isRow(row)) return null;
  return {
    seq: integerField(row, "seq"),
    engineId: stringField(row, "engine_id"),
    userText: stringField(row, "user_text"),
    answerText: stringField(row, "answer_text"),
    factsJson: stringField(row, "facts_json"),
    outcome: stringField(row, "outcome"),
  };
}

function missingThread(threadId: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason: `Chat ${threadId} was not found in this project` };
}

export class ThreadsRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  seat(threadId: string, engineId: string): ThreadSeatRecord | null {
    const row = this.db
      .prepare(
        `SELECT engine_id, engine_session_id, synced_turn_seq FROM thread_engine_sessions
         WHERE thread_id = ? AND engine_id = ?`,
      )
      .get(threadId, engineId);
    return toSeat(row);
  }

  seatCount(threadId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS total FROM thread_engine_sessions WHERE thread_id = ?").get(threadId);
    return isRow(row) ? integerField(row, "total") : 0;
  }

  upsertSeat(threadId: string, projectId: string, seat: ThreadSeatRecord, nowMs: number): StorageResult<null> {
    const now = isoFromMs(nowMs);
    const result = this.db
      .prepare(
        `INSERT INTO thread_engine_sessions (thread_id, engine_id, engine_session_id, synced_turn_seq, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (${THREAD_IN_PROJECT})
         ON CONFLICT (thread_id, engine_id) DO UPDATE SET
           engine_session_id = excluded.engine_session_id,
           synced_turn_seq = excluded.synced_turn_seq,
           updated_at = excluded.updated_at`,
      )
      .run(threadId, seat.engineId, seat.engineSessionId, seat.syncedTurnSeq, now, now, threadId, projectId);
    return Number(result.changes) === 0 ? missingThread(threadId) : { ok: true, value: null };
  }

  appendTurn(threadId: string, projectId: string, turn: ThreadTurnInput, nowMs: number): StorageResult<number> {
    return inTransaction(this.db, () => {
      if (this.db.prepare(THREAD_IN_PROJECT).get(threadId, projectId) === undefined) return missingThread(threadId);
      const last = this.db
        .prepare("SELECT COALESCE(MAX(seq), 0) AS last_seq FROM thread_turns WHERE thread_id = ?")
        .get(threadId);
      const seq = (isRow(last) ? integerField(last, "last_seq") : 0) + 1;
      this.db
        .prepare(
          `INSERT INTO thread_turns (thread_id, seq, engine_id, user_text, answer_text, facts_json, outcome, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(threadId, seq, turn.engineId, turn.userText, turn.answerText, turn.factsJson, turn.outcome, isoFromMs(nowMs));
      return { ok: true, value: seq };
    });
  }

  turnsSince(threadId: string, afterSeq: number, limit: number): ThreadTurnPage {
    const rows = this.db
      .prepare(
        `SELECT seq, engine_id, user_text, answer_text, facts_json, outcome FROM thread_turns
         WHERE thread_id = ? AND seq > ? ORDER BY seq DESC LIMIT ?`,
      )
      .all(threadId, afterSeq, limit);
    const turns = rows.map(toTurn).filter((turn): turn is ThreadTurnRecord => turn !== null).reverse();
    const counted = this.db
      .prepare("SELECT COUNT(*) AS total FROM thread_turns WHERE thread_id = ? AND seq > ?")
      .get(threadId, afterSeq);
    const total = isRow(counted) ? integerField(counted, "total") : 0;
    return { turns, omittedCount: Math.max(0, total - turns.length) };
  }

  engineOf(threadId: string): string | null {
    const row = this.db.prepare("SELECT engine_id FROM sessions WHERE id = ?").get(threadId);
    return isRow(row) ? stringField(row, "engine_id") : null;
  }
}
