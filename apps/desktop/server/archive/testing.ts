import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ChatDirectory } from "../chat/index.ts";
import type { ServerMessage } from "../shared/index.ts";
import { ProjectsRepo, SessionsRepo, SettingsRepo, prepareDatabase } from "../storage/index.ts";

export const NOW_MS = Date.UTC(2026, 8, 23);
export const DAY_MS = 86_400_000;

export async function archiveFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "weave-archive-")));
  const a = join(root, "a");
  const b = join(root, "b");
  await Promise.all([mkdir(a), mkdir(b)]);
  const db = prepareDatabase(new DatabaseSync(":memory:"));
  const projects = new ProjectsRepo(db);
  const sessions = new SessionsRepo(db);
  const settings = new SettingsRepo(db);
  const projectA = projects.resolve(a, NOW_MS);
  const projectB = projects.resolve(b, NOW_MS);
  const recordAt = (sessionId: string, projectId: string, dir: string, atMs: number) =>
    sessions.record({ sessionId, projectId, workingDir: dir, title: sessionId, engineId: "codex", personaIds: [] }, atMs);
  const sent: ServerMessage[] = [];
  return {
    root,
    a,
    b,
    db,
    projects,
    sessions,
    settings,
    projectA,
    projectB,
    recordAt,
    sent,
    send: (msg: ServerMessage) => sent.push(msg),
    directory: new ChatDirectory(projects, sessions),
  };
}
