import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ProjectsRepo, SessionsRepo, prepareDatabase } from "../storage/index.ts";
import { ChatDirectory, MAX_LISTED_PROJECTS, parseProjectDirs } from "./chat-directory.ts";

const NOW_MS = Date.UTC(2026, 8, 23);

async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "weave-directory-")));
  const [a, b, neverOpened] = ["a", "b", "never-opened"].map((name) => join(root, name));
  if (!a || !b || !neverOpened) throw new Error("fixture paths missing");
  await Promise.all([a, b, neverOpened].map((dir) => mkdir(dir)));
  const db = prepareDatabase(new DatabaseSync(":memory:"));
  const projects = new ProjectsRepo(db);
  const sessions = new SessionsRepo(db);
  for (const [dir, sessionId] of [[a, "chat-a"], [b, "chat-b"]] as const) {
    const project = projects.resolve(dir, NOW_MS);
    sessions.record({ sessionId, projectId: project.id, workingDir: dir, title: sessionId, engineId: "codex", personaIds: [] }, NOW_MS);
  }
  return { root, a, b, neverOpened, directory: new ChatDirectory(projects, sessions) };
}

test("each folder gets only its own project's chats", async () => {
  const { a, b, directory } = await setup();
  const listing = await directory.listForFolders([a, b]);
  assert.deepEqual(listing.chatsByProject[a]?.map((chat) => chat.id), ["chat-a"]);
  assert.deepEqual(listing.chatsByProject[b]?.map((chat) => chat.id), ["chat-b"]);
});

test("a symlink or trailing slash finds the same project, keyed by what was asked", async () => {
  const { root, a, directory } = await setup();
  await symlink(a, join(root, "alias"));
  const asked = [`${a}/`, join(root, "alias")];
  const listing = await directory.listForFolders(asked);
  for (const dir of asked) assert.deepEqual(listing.chatsByProject[dir]?.map((chat) => chat.id), ["chat-a"], dir);
});

test("a folder never opened has no chats, and a deleted project folder still lists its chats", async () => {
  const { a, neverOpened, directory } = await setup();
  const listing = await directory.listForFolders([neverOpened, join(a, "..", "gone")]);
  assert.deepEqual(listing.chatsByProject[neverOpened], []);
  assert.deepEqual(listing.chatsByProject[join(a, "..", "gone")], []);
  await rm(a, { recursive: true });
  const afterDelete = await directory.listForFolders([a]);
  assert.deepEqual(afterDelete.chatsByProject[a]?.map((chat) => chat.id), ["chat-a"]);
});

test("archived chats are listed separately from active ones", async () => {
  const { a, directory } = await setup();
  await directory.setChatArchived(a, "chat-a", NOW_MS);
  const listing = await directory.listForFolders([a]);
  assert.deepEqual(listing.chatsByProject[a], []);
  assert.deepEqual(listing.archivedChatsByProject[a]?.map((chat) => [chat.id, chat.archivedAt]), [["chat-a", NOW_MS]]);
});

test("folder requests from the client are strings only, deduplicated and capped", () => {
  assert.deepEqual(parseProjectDirs(["/b", "/a", "/b", 3, "", null]), ["/a", "/b"]);
  assert.equal(parseProjectDirs(Array.from({ length: 100 }, (_, index) => `/p${index}`)).length, MAX_LISTED_PROJECTS);
  assert.deepEqual(parseProjectDirs("/a"), []);
});
