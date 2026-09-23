import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionUpdate } from "@weave/protocol";
import { readClaudeCompactSummary } from "./claude-summary-reader.ts";
import { summaryFromClaudeRecord, summaryFromReplayText } from "./compact-summary.ts";
import { HistoryStore } from "./history-store.ts";
import { isSafeSessionId, parseArchive } from "./parse-archive.ts";
import { ReplayGate } from "./replay-gate.ts";

const SUMMARY = "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion.\n\nSummary:\n1. Built V1.2";
const SESSION = "7878fb89-7d4d-4728-8355-e7ccb818a6cb";
const TURNS = [{ id: "u1", role: "user", text: "hi", thought: "", tools: [] }];

function userChunk(text: string): SessionUpdate {
  return { sessionUpdate: "user_message_chunk", content: { type: "text", text } };
}

test("session ids that could escape the history folder are rejected", () => {
  assert.equal(isSafeSessionId(SESSION), true);
  for (const bad of ["../etc", "a/b", "", ".hidden", "x".repeat(200), 42]) assert.equal(isSafeSessionId(bad), false);
});

test("archive parsing checks shape and reports why", () => {
  assert.equal(parseArchive({ sessionId: SESSION, turns: TURNS, droppedTurnCount: 0 }).ok, true);
  const bad = parseArchive({ sessionId: SESSION, turns: [{ id: 1 }], droppedTurnCount: 0 });
  assert.deepEqual(bad, { ok: false, reason: "archive turn 0 has no id or a known role" });
  assert.equal(parseArchive({ sessionId: SESSION, turns: TURNS, droppedTurnCount: -1 }).ok, false);
});

test("summary detection is anchored to Claude's continuation preamble", () => {
  assert.equal(summaryFromReplayText(SUMMARY), SUMMARY);
  assert.equal(summaryFromReplayText(`quote: ${SUMMARY}`), null);
  assert.equal(summaryFromReplayText("hy"), null);
});

test("claude records yield the compact summary; malformed lines are skipped", () => {
  const record = JSON.stringify({ type: "user", isCompactSummary: true, message: { role: "user", content: SUMMARY } });
  assert.equal(summaryFromClaudeRecord(record), SUMMARY);
  assert.equal(summaryFromClaudeRecord('{"isCompactSummary":true, broken'), null);
  assert.equal(summaryFromClaudeRecord(JSON.stringify({ type: "user", message: { content: "hi" } })), null);
});

test("history store round-trips, reports missing as null, refuses bad ids", async () => {
  const store = new HistoryStore(await mkdtemp(join(tmpdir(), "weave-history-")));
  assert.deepEqual(await store.load(SESSION), { ok: true, value: null });
  const archive = { version: 1, sessionId: SESSION, turns: TURNS, droppedTurnCount: 2 };
  assert.deepEqual(await store.save(archive), { ok: true, value: null });
  assert.deepEqual(await store.load(SESSION), { ok: true, value: archive });
  assert.equal((await store.load("../escape")).ok, false);
  assert.equal((await store.save({ ...archive, sessionId: "../escape" })).ok, false);
});

test("replay gate restores the archive only when replay starts with a summary", () => {
  const archive = { version: 1, sessionId: SESSION, turns: TURNS, droppedTurnCount: 0 };
  const gate = new ReplayGate();
  gate.arm(SESSION, archive);
  const decision = gate.filter(userChunk(SUMMARY), SESSION);
  assert.equal(decision.forward, false);
  assert.deepEqual(decision.messages.map((message) => message.type), ["history-archive", "compaction-summary"]);
  assert.deepEqual(gate.filter(userChunk("hy"), SESSION), { forward: true, messages: [] });
});

test("an engine that replays full history never gets the archive", () => {
  const gate = new ReplayGate();
  gate.arm(SESSION, { version: 1, sessionId: SESSION, turns: TURNS, droppedTurnCount: 0 });
  assert.equal(gate.filter(userChunk("first real message"), SESSION).forward, true);
  const later = gate.filter(userChunk(SUMMARY), SESSION);
  assert.deepEqual(later.messages.map((message) => message.type), ["compaction-summary"]);
});

test("unarmed or other-session replays pass through", () => {
  const gate = new ReplayGate();
  assert.deepEqual(gate.filter(userChunk(SUMMARY), SESSION), { forward: true, messages: [] });
  gate.arm(SESSION, null);
  assert.equal(gate.filter(userChunk(SUMMARY), "other-session").forward, true);
  gate.disarm();
  assert.equal(gate.filter(userChunk(SUMMARY), SESSION).forward, true);
});

test("claude reader finds the latest summary in the session file", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "weave-claude-"));
  const projectDir = "/Users/test/Coding/My.App";
  const folder = join(configDir, "projects", "-Users-test-Coding-My-App");
  await mkdir(folder, { recursive: true });
  const older = JSON.stringify({ isCompactSummary: true, message: { content: `${SUMMARY} (old)` } });
  const newer = JSON.stringify({ isCompactSummary: true, message: { content: [{ type: "text", text: SUMMARY }] } });
  await writeFile(join(folder, `${SESSION}.jsonl`), [older, "{bad", newer, "{}"].join("\n"));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  try {
    assert.equal(await readClaudeCompactSummary(projectDir, SESSION), SUMMARY);
    assert.equal(await readClaudeCompactSummary(projectDir, "missing-session"), null);
    assert.equal(await readClaudeCompactSummary(projectDir, "../escape"), null);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
});
