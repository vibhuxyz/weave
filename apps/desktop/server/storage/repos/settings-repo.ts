import type { DatabaseSync } from "node:sqlite";
import { isRow, isoFromMs, stringField } from "./rows.ts";

export class SettingsRepo {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    return isRow(row) ? stringField(row, "value") : null;
  }

  set(key: string, value: string, nowMs: number): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, isoFromMs(nowMs));
  }
}
