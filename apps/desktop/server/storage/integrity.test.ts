import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabaseFile } from "./database.ts";
import { ArchivesRepo, ProjectsRepo, SessionsRepo } from "./repos/index.ts";

const NOW_MS = Date.UTC(2026, 8, 23);
const SHORT_BUSY_TIMEOUT_MS = 20;

async function databasePath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "weave-db-")), "weave.sqlite");
}

function recordChat(db: DatabaseSync, sessionId: string, personaIds: readonly string[] = []) {
  const project = new ProjectsRepo(db).resolve("/work/a", NOW_MS);
  const result = new SessionsRepo(db).record(
    { sessionId, projectId: project.id, workingDir: "/work/a", title: "t", engineId: "claude-code", personaIds },
    NOW_MS,
  );
  return { project, result };
}

function count(db: DatabaseSync, table: string): unknown {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n;
}

test("chats, personas and archives survive a server restart", async () => {
  const path = await databasePath();
  const first = openDatabaseFile(path);
  const { project } = recordChat(first, "session-1", ["agent:a"]);
  new ArchivesRepo(first).save(project.id, "session-1", "{}", NOW_MS);
  first.close();
  const second = openDatabaseFile(path);
  assert.deepEqual(new SessionsRepo(second).listForProject(project.id).map((chat) => chat.id), ["session-1"]);
  assert.deepEqual(new SessionsRepo(second).personaIds("session-1"), ["agent:a"]);
  assert.equal(new ArchivesRepo(second).load(project.id, "session-1"), "{}");
  second.close();
});

test("two connections to one database see each other's writes", async () => {
  const path = await databasePath();
  const windowA = openDatabaseFile(path);
  const windowB = openDatabaseFile(path);
  recordChat(windowA, "from-a");
  const { project } = recordChat(windowB, "from-b");
  const ids = new SessionsRepo(windowA).listForProject(project.id).map((chat) => chat.id).sort();
  assert.deepEqual(ids, ["from-a", "from-b"]);
  windowA.close();
  windowB.close();
});

test("a locked database returns a busy result and leaves no partial chat", async () => {
  const path = await databasePath();
  const holder = openDatabaseFile(path);
  const writer = openDatabaseFile(path);
  const project = new ProjectsRepo(holder).resolve("/work/a", NOW_MS);
  writer.exec(`PRAGMA busy_timeout = ${SHORT_BUSY_TIMEOUT_MS}`);
  holder.exec("BEGIN IMMEDIATE");
  const blocked = new SessionsRepo(writer).record(
    { sessionId: "blocked", projectId: project.id, workingDir: "/work/a", title: "t", engineId: "codex", personaIds: ["agent:a"] },
    NOW_MS,
  );
  holder.exec("COMMIT");
  assert.equal(blocked.ok, false);
  assert.match(blocked.ok ? "" : blocked.reason, /busy/);
  assert.equal(count(writer, "sessions"), 0);
  assert.equal(count(writer, "session_personas"), 0);
  holder.close();
  writer.close();
});

test("deleting a chat or a project leaves no orphaned personas or archives", async () => {
  const db = openDatabaseFile(await databasePath());
  const { project } = recordChat(db, "session-1", ["agent:a", "agent:b"]);
  new ArchivesRepo(db).save(project.id, "session-1", "{}", NOW_MS);
  recordChat(db, "session-2", ["agent:a"]);
  db.prepare("DELETE FROM sessions WHERE id = ?").run("session-1");
  assert.equal(count(db, "session_personas"), 1);
  assert.equal(count(db, "history_archives"), 0);
  db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
  assert.equal(count(db, "sessions"), 0);
  assert.equal(count(db, "session_personas"), 0);
  db.close();
});

test("foreign keys are enforced", async () => {
  const db = openDatabaseFile(await databasePath());
  assert.throws(() =>
    db
      .prepare("INSERT INTO sessions (id, project_id, working_dir, title, engine_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("s", "no-such-project", "/w", "t", "e", "x", "x"),
  );
  db.close();
});

test("a database from a newer Weave is refused instead of downgraded", async () => {
  const path = await databasePath();
  const db = openDatabaseFile(path);
  db.exec("PRAGMA user_version = 99");
  db.close();
  assert.throws(() => openDatabaseFile(path), (error: unknown) => {
    const cause = error instanceof Error ? error.cause : null;
    return cause instanceof Error && /schema version 99/.test(cause.message);
  });
});

test("a corrupt database file is refused with the file named", async () => {
  const path = await databasePath();
  await writeFile(path, "not a database at all ".repeat(200));
  assert.throws(() => openDatabaseFile(path), new RegExp(`Cannot open the Weave database at ${path}`));
});
