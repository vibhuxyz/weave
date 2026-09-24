import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AutoArchive, parseAutoArchiveDays } from "./auto-archive.ts";
import { handleChatAction } from "./chat-actions.ts";
import { handleDeleteProject } from "./delete-project.ts";
import { DAY_MS, NOW_MS, archiveFixture } from "./testing.ts";
import type { ChatAction } from "./types.ts";

async function withChats() {
  const fixture = await archiveFixture();
  fixture.recordAt("chat-1", fixture.projectA.id, fixture.a, NOW_MS);
  fixture.recordAt("chat-2", fixture.projectA.id, fixture.a, NOW_MS);
  const calls = { newChat: 0, chats: 0 };
  const act = (action: ChatAction, request: { sessionId: unknown; projectDir: unknown }, current: string | null = null) =>
    handleChatAction(action, request, {
      directory: fixture.directory,
      currentSessionId: () => current,
      now: () => NOW_MS,
      send: fixture.send,
      sendChats: async () => {
        calls.chats += 1;
      },
      startNewChat: async () => {
        calls.newChat += 1;
      },
    });
  return { ...fixture, calls, act };
}

const ids = (chats: readonly { readonly id: string }[]) => chats.map((chat) => chat.id);

test("archiving hides a chat from the list and restoring brings it back", async () => {
  const { a, sessions, projectA, sent, calls, act } = await withChats();
  await act("archive", { sessionId: "chat-1", projectDir: a });
  assert.deepEqual(ids(sessions.listForProject(projectA.id)), ["chat-2"]);
  assert.deepEqual(ids(sessions.listArchivedForProject(projectA.id)), ["chat-1"]);
  await act("restore", { sessionId: "chat-1", projectDir: a });
  assert.deepEqual(ids(sessions.listForProject(projectA.id)).sort(), ["chat-1", "chat-2"]);
  assert.deepEqual(sent.map((msg) => msg.type), ["chat-archived", "chat-restored"]);
  assert.deepEqual(calls, { newChat: 0, chats: 2 });
});

test("archiving the open chat starts a fresh one and clears the resume pointer", async () => {
  const { a, projects, projectA, calls, act } = await withChats();
  projects.setLastSessionId(projectA.id, "chat-1", NOW_MS);
  await act("archive", { sessionId: "chat-1", projectDir: a }, "chat-1");
  assert.deepEqual(calls, { newChat: 1, chats: 0 });
  assert.equal(projects.lastSessionId(projectA.id), null);
});

test("a new message in an archived chat un-archives it", async () => {
  const { a, sessions, projectA, recordAt, act } = await withChats();
  await act("archive", { sessionId: "chat-1", projectDir: a });
  recordAt("chat-1", projectA.id, a, NOW_MS + 1);
  assert.deepEqual(ids(sessions.listArchivedForProject(projectA.id)), []);
});

test("chat actions through another project's folder or with bad input are refused", async () => {
  const { a, b, sessions, projectA, sent, act } = await withChats();
  await act("archive", { sessionId: "chat-1", projectDir: b });
  await act("delete", { sessionId: "chat-1", projectDir: b });
  await act("archive", { sessionId: "../chat-1", projectDir: a });
  await act("restore", { sessionId: "chat-1", projectDir: 7 });
  assert.deepEqual(sent.map((msg) => msg.type), ["error", "error", "error", "error"]);
  assert.equal(sessions.listForProject(projectA.id).length, 2);
});

test("automatic archiving is off by default and only accepts listed day counts", async () => {
  const { settings, sessions } = await archiveFixture();
  const auto = new AutoArchive({ settings, sessions, now: () => NOW_MS });
  assert.equal(auto.afterDays(), null);
  assert.deepEqual(auto.run(null), { ok: true, value: 0 });
  assert.equal(parseAutoArchiveDays(7), 7);
  assert.equal(parseAutoArchiveDays("30"), 30);
  assert.equal(parseAutoArchiveDays(null), null);
  assert.equal(parseAutoArchiveDays(3), undefined);
  assert.equal(parseAutoArchiveDays("7; DROP TABLE"), undefined);
});

test("automatic archiving archives idle chats but keeps recent and open ones", async () => {
  const { a, b, settings, sessions, projects, projectA, projectB, recordAt } = await archiveFixture();
  recordAt("old", projectA.id, a, NOW_MS - 10 * DAY_MS);
  recordAt("old-but-open", projectA.id, a, NOW_MS - 10 * DAY_MS);
  recordAt("recent", projectA.id, a, NOW_MS - DAY_MS);
  recordAt("old-in-b", projectB.id, b, NOW_MS - 10 * DAY_MS);
  projects.setLastSessionId(projectB.id, "old-in-b", NOW_MS);
  const auto = new AutoArchive({ settings, sessions, now: () => NOW_MS });
  auto.setAfterDays(7);
  assert.deepEqual(auto.run("old-but-open"), { ok: true, value: 2 });
  assert.deepEqual(ids(sessions.listForProject(projectA.id)).sort(), ["old-but-open", "recent"]);
  assert.deepEqual(ids(sessions.listArchivedForProject(projectB.id)), ["old-in-b"]);
  assert.equal(projects.lastSessionId(projectB.id), null);
  assert.equal(new AutoArchive({ settings, sessions, now: () => NOW_MS }).afterDays(), 7);
});

test("deleting a project removes its chats and Weave data but never the project folder", async () => {
  const { root, a, b, sessions, projectA, projectB, recordAt, directory, sent, send } = await archiveFixture();
  recordAt("chat-b", projectB.id, b, NOW_MS);
  await writeFile(join(b, "keep.txt"), "user file");
  const dataDir = join(root, "home", "projects", projectB.id);
  await mkdir(join(dataDir, "logs"), { recursive: true });
  await handleDeleteProject({ projectDir: b }, { directory, currentProjectId: projectA.id, weaveHome: join(root, "home"), send });
  assert.deepEqual(sent, [{ type: "project-deleted", projectDir: b, removedChatCount: 1 }]);
  assert.equal(sessions.countForProject(projectB.id), 0);
  await assert.rejects(stat(dataDir));
  assert.equal((await stat(join(b, "keep.txt"))).isFile(), true);
  assert.equal(await directory.projectForFolder(b), null);
  assert.notEqual(await directory.projectForFolder(a), null);
});

test("the open project cannot be deleted, and a deleted folder's project still can be", async () => {
  const { root, a, b, projectA, projectB, recordAt, directory, sent, send } = await archiveFixture();
  const options = { directory, currentProjectId: projectA.id, weaveHome: join(root, "home"), send };
  await handleDeleteProject({ projectDir: a }, options);
  assert.equal(sent[0]?.type, "error");
  recordAt("chat-b", projectB.id, b, NOW_MS);
  await rm(b, { recursive: true });
  await handleDeleteProject({ projectDir: b }, options);
  assert.deepEqual(sent[1], { type: "project-deleted", projectDir: b, removedChatCount: 1 });
});
