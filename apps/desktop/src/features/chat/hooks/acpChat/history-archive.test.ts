import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryArchive, restoreArchivedTurns } from "./history-archive.ts";
import { applyReplayedSummary } from "./compaction-turns.ts";
import type { ChatTurn } from "./types.ts";

const NOW = 1_700_000_000_000;

function turn(id: string, role: ChatTurn["role"], extra: Partial<ChatTurn> = {}): ChatTurn {
  return { id, role, text: id, thought: "", tools: [], ...extra };
}

const notice = turn("op-1", "notice", {
  compaction: {
    operationId: "op-1", origin: "live", summary: "Summary: x", trigger: "manual", status: "completed",
    startedAt: NOW, settledAt: NOW, contextBefore: null, contextAfter: null, failureReason: null,
  },
});

test("archive keeps everything up to and including the compaction row", () => {
  const archive = buildHistoryArchive([turn("u1", "user"), turn("a1", "assistant"), notice, turn("u2", "user")], "op-1");
  assert.deepEqual(archive?.turns.map((item) => item.id), ["u1", "a1", "op-1"]);
  assert.equal(archive?.droppedTurnCount, 0);
  assert.equal(buildHistoryArchive([turn("u1", "user")], "missing"), null);
});

test("archive drops dead blob previews and trims huge tool output", () => {
  const withImage = turn("u1", "user", { images: [{ previewUrl: "blob:abc", mimeType: "image/png", prompt: "" }] });
  const withTool = turn("a1", "assistant", {
    tools: [{ id: "t", title: "ls", status: "completed", kind: "execute", output: "x".repeat(20_000) }],
  });
  const archive = buildHistoryArchive([withImage, withTool, notice], "op-1");
  assert.deepEqual(archive?.turns[0]?.images?.[0], { previewUrl: "", mimeType: "image/png", prompt: "", unavailable: true });
  assert.ok((archive?.turns[1]?.tools[0]?.output?.length ?? 0) < 8_100);
});

test("the gap marker is never archived, but its count carries forward", () => {
  const gap = turn("history-gap", "notice", { historyGap: 3 });
  const archive = buildHistoryArchive([gap, turn("u1", "user"), notice], "op-1");
  assert.deepEqual(archive?.turns.map((item) => item.id), ["u1", "op-1"]);
  assert.equal(archive?.droppedTurnCount, 3);
});

test("restore skips malformed turns and reports them with the dropped count", () => {
  const restored = restoreArchivedTurns([turn("u1", "user"), { id: "x" }, notice], 2);
  assert.deepEqual(restored.map((item) => [item.id, item.historyGap]), [["history-gap", 3], ["u1", undefined], ["op-1", undefined]]);
  assert.equal(restoreArchivedTurns([turn("u1", "user")], 0).length, 1);
});

test("a replayed summary fills the latest compaction row, or adds an 'earlier' row", () => {
  const withoutSummary = { ...notice, compaction: notice.compaction && { ...notice.compaction, summary: null } };
  const filled = applyReplayedSummary([turn("u1", "user"), withoutSummary], { summary: "S", noticeId: "n2", now: NOW });
  assert.equal(filled.at(-1)?.compaction?.summary, "S");
  assert.equal(filled.length, 2);

  const legacy = applyReplayedSummary([], { summary: "S", noticeId: "n2", now: NOW });
  assert.deepEqual(legacy.map((item) => [item.id, item.compaction?.origin, item.compaction?.summary]), [["n2", "replay", "S"]]);
});
