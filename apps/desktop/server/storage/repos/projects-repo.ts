import { basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { uuidV7 } from "../../shared/index.ts";
import type { ProjectRecord } from "../types.ts";
import { isRow, isoFromMs, optionalStringField, stringField } from "./rows.ts";

function toProject(row: unknown): ProjectRecord | null {
  if (!isRow(row)) return null;
  return { id: stringField(row, "id"), name: stringField(row, "name"), rootPath: stringField(row, "root_path") };
}

export class ProjectsRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findByRootPath(rootPath: string): ProjectRecord | null {
    return toProject(this.db.prepare("SELECT id, name, root_path FROM projects WHERE root_path = ?").get(rootPath));
  }

  resolve(rootPath: string, nowMs: number): ProjectRecord {
    const existing = this.findByRootPath(rootPath);
    if (existing) return existing;
    const now = isoFromMs(nowMs);
    this.db
      .prepare(
        "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (root_path) DO NOTHING",
      )
      .run(uuidV7(nowMs), basename(rootPath) || rootPath, rootPath, now, now);
    const created = this.findByRootPath(rootPath);
    if (!created) throw new Error(`Cannot register project ${rootPath}`);
    return created;
  }

  delete(projectId: string): boolean {
    return Number(this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId).changes) > 0;
  }

  lastSessionId(projectId: string): string | null {
    const row = this.db.prepare("SELECT last_session_id FROM projects WHERE id = ?").get(projectId);
    return isRow(row) ? optionalStringField(row, "last_session_id") : null;
  }

  setLastSessionId(projectId: string, sessionId: string, nowMs: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE projects SET last_session_id = ?, updated_at = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND project_id = ?)`,
      )
      .run(sessionId, isoFromMs(nowMs), projectId, sessionId, projectId);
    return Number(result.changes) > 0;
  }
}
