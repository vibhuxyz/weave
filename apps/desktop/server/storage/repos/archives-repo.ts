import type { DatabaseSync } from "node:sqlite";
import type { StorageResult } from "../types.ts";
import { isRow, isoFromMs, stringField } from "./rows.ts";
import { inTransaction } from "./transaction.ts";

export class ArchivesRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  load(projectId: string, sessionId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT a.archive_json FROM history_archives a
         JOIN sessions s ON s.id = a.session_id
         WHERE a.session_id = ? AND s.project_id = ?`,
      )
      .get(sessionId, projectId);
    return isRow(row) ? stringField(row, "archive_json") : null;
  }

  save(projectId: string, sessionId: string, archiveJson: string, nowMs: number): StorageResult<null> {
    return inTransaction(this.db, () => this.upsert(projectId, sessionId, archiveJson, isoFromMs(nowMs)));
  }

  private upsert(projectId: string, sessionId: string, archiveJson: string, now: string): StorageResult<null> {
    const result = this.db
      .prepare(
        `INSERT INTO history_archives (session_id, archive_json, created_at, updated_at)
         SELECT s.id, ?, ?, ? FROM sessions s WHERE s.id = ? AND s.project_id = ?
         ON CONFLICT (session_id) DO UPDATE SET archive_json = excluded.archive_json, updated_at = excluded.updated_at`,
      )
      .run(archiveJson, now, now, sessionId, projectId);
    if (Number(result.changes) === 0) {
      return { ok: false, reason: `Session ${sessionId} is not a chat of this project` };
    }
    return { ok: true, value: null };
  }
}
