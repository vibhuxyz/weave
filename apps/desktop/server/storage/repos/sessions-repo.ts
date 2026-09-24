import type { DatabaseSync } from "node:sqlite";
import { MAX_LISTED_CHATS, MAX_PERSONAS_PER_SESSION, MAX_PERSONA_ID_CHARS, MAX_TITLE_CHARS } from "../constants.ts";
import type { ChatSummary, SessionRecordInput, StorageResult } from "../types.ts";
import { isRow, isoFromMs, msFromIso, optionalStringField, stringField } from "./rows.ts";
import { inTransaction } from "./transaction.ts";

function toChatSummary(row: unknown): ChatSummary | null {
  if (!isRow(row)) return null;
  return {
    id: stringField(row, "id"),
    title: stringField(row, "title"),
    createdAt: msFromIso(stringField(row, "created_at")),
    updatedAt: msFromIso(stringField(row, "updated_at")),
    archivedAt: archivedAtMs(optionalStringField(row, "archived_at")),
  };
}

function archivedAtMs(iso: string | null): number | null {
  return iso === null ? null : msFromIso(iso);
}

const CHAT_COLUMNS = "id, title, created_at, updated_at, archived_at";

function validPersonaIds(personaIds: readonly string[]): readonly string[] {
  const unique = [...new Set(personaIds)].filter((id) => id.length > 0 && id.length <= MAX_PERSONA_ID_CHARS);
  return unique.sort().slice(0, MAX_PERSONAS_PER_SESSION);
}

export class SessionsRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  record(input: SessionRecordInput, nowMs: number): StorageResult<null> {
    return inTransaction(this.db, () => this.recordWithPersonas(input, isoFromMs(nowMs)));
  }

  private recordWithPersonas(input: SessionRecordInput, now: string): StorageResult<null> {
    const result = this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, working_dir, title, engine_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           updated_at = excluded.updated_at,
           archived_at = NULL,
           engine_id = excluded.engine_id,
           title = CASE WHEN sessions.title = '' THEN excluded.title ELSE sessions.title END
         WHERE sessions.project_id = excluded.project_id`,
      )
      .run(input.sessionId, input.projectId, input.workingDir, input.title.slice(0, MAX_TITLE_CHARS), input.engineId, now, now);
    if (Number(result.changes) === 0) {
      return { ok: false, reason: `Session ${input.sessionId} is already registered to another project` };
    }
    const addPersona = this.db.prepare(
      "INSERT INTO session_personas (session_id, persona_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    );
    for (const personaId of validPersonaIds(input.personaIds)) addPersona.run(input.sessionId, personaId, now);
    return { ok: true, value: null };
  }

  listForProject(projectId: string): readonly ChatSummary[] {
    const rows = this.db
      .prepare(
        `SELECT ${CHAT_COLUMNS} FROM sessions
         WHERE project_id = ? AND archived_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(projectId, MAX_LISTED_CHATS);
    return rows.map(toChatSummary).filter((chat): chat is ChatSummary => chat !== null);
  }

  listArchivedForProject(projectId: string): readonly ChatSummary[] {
    const rows = this.db
      .prepare(
        `SELECT ${CHAT_COLUMNS} FROM sessions
         WHERE project_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC LIMIT ?`,
      )
      .all(projectId, MAX_LISTED_CHATS);
    return rows.map(toChatSummary).filter((chat): chat is ChatSummary => chat !== null);
  }

  setArchived(sessionId: string, projectId: string, archivedAtMs: number | null): StorageResult<null> {
    return inTransaction(this.db, () => {
      if (archivedAtMs !== null) {
        this.db
          .prepare("UPDATE projects SET last_session_id = NULL WHERE id = ? AND last_session_id = ?")
          .run(projectId, sessionId);
      }
      const changed = this.db
        .prepare("UPDATE sessions SET archived_at = ? WHERE id = ? AND project_id = ?")
        .run(archivedAtMs === null ? null : isoFromMs(archivedAtMs), sessionId, projectId);
      if (Number(changed.changes) === 0) return { ok: false, reason: `Chat ${sessionId} was not found in this project` };
      return { ok: true, value: null };
    });
  }

  archiveInactive(cutoffMs: number, keepSessionId: string | null, nowMs: number): StorageResult<number> {
    return inTransaction(this.db, () => {
      const result = this.db
        .prepare(
          `UPDATE sessions SET archived_at = ?
           WHERE archived_at IS NULL AND updated_at < ? AND id IS NOT ?`,
        )
        .run(isoFromMs(nowMs), isoFromMs(cutoffMs), keepSessionId);
      this.db
        .prepare(
          `UPDATE projects SET last_session_id = NULL
           WHERE last_session_id IN (SELECT id FROM sessions WHERE archived_at IS NOT NULL)`,
        )
        .run();
      return { ok: true, value: Number(result.changes) };
    });
  }

  delete(sessionId: string, projectId: string): StorageResult<null> {
    return inTransaction(this.db, () => {
      this.db
        .prepare("UPDATE projects SET last_session_id = NULL WHERE id = ? AND last_session_id = ?")
        .run(projectId, sessionId);
      const removed = this.db.prepare("DELETE FROM sessions WHERE id = ? AND project_id = ?").run(sessionId, projectId);
      if (Number(removed.changes) === 0) return { ok: false, reason: `Chat ${sessionId} was not found in this project; it may already be deleted` };
      return { ok: true, value: null };
    });
  }

  countForProject(projectId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE project_id = ?").get(projectId);
    const total = isRow(row) ? row.total : 0;
    return typeof total === "number" ? total : 0;
  }

  belongsToProject(sessionId: string, projectId: string): boolean {
    return this.db.prepare("SELECT 1 AS found FROM sessions WHERE id = ? AND project_id = ?").get(sessionId, projectId) !== undefined;
  }

  personaIds(sessionId: string): readonly string[] {
    const rows = this.db
      .prepare("SELECT persona_id FROM session_personas WHERE session_id = ? ORDER BY persona_id")
      .all(sessionId);
    return rows.filter(isRow).map((row) => stringField(row, "persona_id"));
  }
}
