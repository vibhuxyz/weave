import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ProjectsRepo, SessionsRepo, prepareDatabase } from "../storage/index.ts";
import { ProjectChats, parsePersonaIds } from "./project-chats.ts";

const NOW_MS = Date.UTC(2026, 8, 23);
const DETAILS = { title: "Add login", engineId: "claude-code", personaIds: ["agent:reviewer"] } as const;

function twoProjects() {
  const db = prepareDatabase(new DatabaseSync(":memory:"));
  const projects = new ProjectsRepo(db);
  const sessions = new SessionsRepo(db);
  const chatsFor = (rootPath: string) =>
    new ProjectChats({ project: projects.resolve(rootPath, NOW_MS), workingDir: rootPath, sessions, projects, now: () => NOW_MS });
  return { a: chatsFor("/work/a"), b: chatsFor("/work/b"), sessions, projects };
}

test("the same folder always resolves to the same project", () => {
  const { projects } = twoProjects();
  assert.equal(projects.resolve("/work/a", NOW_MS).id, projects.resolve("/work/a", NOW_MS + 1).id);
  assert.notEqual(projects.resolve("/work/a", NOW_MS).id, projects.resolve("/work/b", NOW_MS).id);
});

test("a chat recorded in project A is listed only in project A", () => {
  const { a, b } = twoProjects();
  assert.deepEqual(a.record("session-1", DETAILS), { ok: true, value: null });
  assert.deepEqual(a.list().map((chat) => chat.id), ["session-1"]);
  assert.deepEqual(b.list(), []);
  assert.equal(a.has("session-1"), true);
  assert.equal(b.has("session-1"), false);
});

test("project B cannot claim or re-title project A's chat", () => {
  const { a, b } = twoProjects();
  a.record("session-1", DETAILS);
  assert.equal(b.record("session-1", { ...DETAILS, title: "stolen" }).ok, false);
  assert.equal(a.list()[0]?.title, "Add login");
});

test("the last session is remembered per project and only for its own chats", () => {
  const { a, b } = twoProjects();
  a.record("session-1", DETAILS);
  assert.equal(a.rememberLastSession("session-1"), true);
  assert.equal(a.lastSessionId(), "session-1");
  assert.equal(b.rememberLastSession("session-1"), false);
  assert.equal(b.lastSessionId(), null);
});

test("personas are stored per chat, deduplicated and sorted", () => {
  const { a, sessions } = twoProjects();
  a.record("session-1", { ...DETAILS, personaIds: ["agent:z", "agent:a", "agent:z", ""] });
  assert.deepEqual(sessions.personaIds("session-1"), ["agent:a", "agent:z"]);
});

test("persona ids from the client keep only strings", () => {
  assert.deepEqual(parsePersonaIds(["agent:a", 4, null, "agent:b"]), ["agent:a", "agent:b"]);
  assert.deepEqual(parsePersonaIds("agent:a"), []);
});
