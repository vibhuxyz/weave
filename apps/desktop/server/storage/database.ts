import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PRIVATE_DIR_MODE, PRIVATE_FILE_MODE, SQLITE_BUSY_TIMEOUT_MS } from "./constants.ts";
import { MIGRATIONS } from "./schema.ts";

function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get();
  const version = row?.user_version;
  return typeof version === "number" ? version : 0;
}

function newerSchemaError(version: number): Error {
  return new Error(
    `The Weave database is at schema version ${version}, newer than this app understands (${MIGRATIONS.length}). Update Weave.`,
  );
}

function applyNextMigration(db: DatabaseSync): boolean {
  const version = schemaVersion(db);
  if (version > MIGRATIONS.length) throw newerSchemaError(version);
  const migration = MIGRATIONS[version];
  if (migration === undefined) return false;
  try {
    db.exec(migration);
  } catch (error: unknown) {
    throw new Error(`Cannot apply database migration ${version + 1}`, { cause: error });
  }
  db.exec(`PRAGMA user_version = ${version + 1}`);
  return true;
}

function migrate(db: DatabaseSync): void {
  for (let step = 0; step <= MIGRATIONS.length; step += 1) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const applied = applyNextMigration(db);
      db.exec("COMMIT");
      if (!applied) return;
    } catch (error: unknown) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function prepareDatabase(db: DatabaseSync): DatabaseSync {
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
  migrate(db);
  return db;
}

export function ensurePrivateDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: PRIVATE_DIR_MODE });
  chmodSync(path, PRIVATE_DIR_MODE);
}

export function openDatabaseFile(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true, mode: PRIVATE_DIR_MODE });
  const db = new DatabaseSync(path);
  try {
    chmodSync(path, PRIVATE_FILE_MODE);
    db.exec("PRAGMA journal_mode = WAL");
    return prepareDatabase(db);
  } catch (error: unknown) {
    db.close();
    throw new Error(`Cannot open the Weave database at ${path}`, { cause: error });
  }
}
