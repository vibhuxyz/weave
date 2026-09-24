import type { DatabaseSync } from "node:sqlite";
import type { StorageResult } from "../types.ts";

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;

export function isDatabaseBusy(error: unknown): boolean {
  if (!(error instanceof Error) || !("errcode" in error)) return false;
  return error.errcode === SQLITE_BUSY || error.errcode === SQLITE_LOCKED;
}

export function inTransaction<T>(db: DatabaseSync, work: () => StorageResult<T>): StorageResult<T> {
  try {
    db.exec("BEGIN IMMEDIATE");
  } catch (error: unknown) {
    if (isDatabaseBusy(error)) return { ok: false, reason: "The Weave database is busy in another process; try again." };
    throw error;
  }
  try {
    const result = work();
    db.exec(result.ok ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error: unknown) {
    db.exec("ROLLBACK");
    if (isDatabaseBusy(error)) return { ok: false, reason: "The Weave database is busy in another process; try again." };
    throw error;
  }
}
