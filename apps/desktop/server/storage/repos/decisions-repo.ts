import type { DatabaseSync } from "node:sqlite";
import { uuidV7 } from "../../shared/index.ts";
import type { DecisionInput, DecisionRecord, StorageResult } from "../types.ts";
import { isRow, isoFromMs, msFromIso, stringField } from "./rows.ts";
import { isDatabaseBusy } from "./transaction.ts";

const BUSY_REASON = "The Weave database is busy in another process; try again.";

function toRecord(row: unknown): DecisionRecord | null {
  if (!isRow(row)) return null;
  return {
    id: stringField(row, "id"),
    question: stringField(row, "question"),
    answer: stringField(row, "answer"),
    engineId: stringField(row, "engine_id"),
    createdAt: msFromIso(stringField(row, "created_at")),
  };
}

export class DecisionsRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  record(input: DecisionInput, nowMs: number): StorageResult<null> {
    try {
      this.db
        .prepare(
          `INSERT INTO user_decisions (id, project_id, question, answer, engine_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(uuidV7(nowMs), input.projectId, input.question, input.answer, input.engineId, isoFromMs(nowMs));
      return { ok: true, value: null };
    } catch (error: unknown) {
      if (isDatabaseBusy(error)) return { ok: false, reason: BUSY_REASON };
      throw error;
    }
  }

  listRecent(projectId: string, limit: number): readonly DecisionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, question, answer, engine_id, created_at FROM user_decisions
         WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(projectId, limit);
    return rows.map(toRecord).filter((record): record is DecisionRecord => record !== null);
  }

  count(projectId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS total FROM user_decisions WHERE project_id = ?").get(projectId);
    return isRow(row) && typeof row.total === "number" ? row.total : 0;
  }
}
