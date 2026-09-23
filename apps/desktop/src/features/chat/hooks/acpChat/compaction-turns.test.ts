import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCompactionSettled,
  applyCompactionStarted,
  failRunningNotices,
  withdrawPromptTurn,
} from "./compaction-turns.ts";
import type { ChatTurn } from "./types.ts";

const NOW = 1_700_000_000_000;
const base = { type: "compaction", sessionId: "s1", trigger: "automatic" } as const;

function userTurn(id: string): ChatTurn {
  return { id, role: "user", text: id, thought: "", tools: [] };
}

function started(operationId: string, promptId: string | null) {
  return { ...base, operationId, status: "started", promptId, contextBefore: null } as const;
}

function ids(turns: readonly ChatTurn[]): string[] {
  return turns.map((turn) => `${turn.id}:${turn.compaction?.status ?? turn.role}`);
}

test("an automatic notice lands before the prompt it gates", () => {
  const turns = [userTurn("earlier"), userTurn("p1")];
  const next = applyCompactionStarted(turns, started("op-1", "p1"), NOW) ?? turns;
  assert.deepEqual(ids(next), ["earlier:user", "op-1:running", "p1:user"]);
});

test("failed notice, then prompt, then assistant keep their order", () => {
  const withNotice = applyCompactionStarted([userTurn("p1")], started("op-1", "p1"), NOW) ?? [];
  const failed = applyCompactionSettled(withNotice, { ...base, operationId: "op-1", status: "failed", reason: "x" }, NOW) ?? [];
  const answered: ChatTurn[] = [...failed, { id: "a1", role: "assistant", text: "ok", thought: "", tools: [] }];
  assert.deepEqual(ids(answered), ["op-1:failed", "p1:user", "a1:assistant"]);
});

test("a duplicate started event does not add a second notice", () => {
  const once = applyCompactionStarted([userTurn("p1")], started("op-1", "p1"), NOW) ?? [];
  assert.equal(applyCompactionStarted(once, started("op-1", "p1"), NOW), null);
});

test("a late event from a previous operation cannot settle the current one", () => {
  const first = applyCompactionStarted([], started("op-1", null), NOW) ?? [];
  const done = applyCompactionSettled(first, { ...base, operationId: "op-1", status: "completed", contextAfter: null, summary: null }, NOW) ?? [];
  const second = applyCompactionStarted(done, started("op-2", null), NOW) ?? [];
  const late = applyCompactionSettled(second, { ...base, operationId: "op-1", status: "failed", reason: "late" }, NOW);
  assert.equal(late, null);
  assert.deepEqual(ids(second), ["op-1:completed", "op-2:running"]);
});

test("withdrawing removes exactly the gated prompt", () => {
  const turns = [userTurn("p0"), userTurn("p1")];
  assert.deepEqual(ids(withdrawPromptTurn(turns, "p1") ?? []), ["p0:user"]);
  assert.equal(withdrawPromptTurn(turns, "missing"), null);
});

test("a dropped connection fails only running notices", () => {
  const done = applyCompactionSettled(
    applyCompactionStarted([], started("op-1", null), NOW) ?? [],
    { ...base, operationId: "op-1", status: "completed", contextAfter: null, summary: null },
    NOW,
  ) ?? [];
  const running = applyCompactionStarted(done, started("op-2", null), NOW) ?? [];
  assert.deepEqual(ids(failRunningNotices(running, "lost", NOW) ?? []), ["op-1:completed", "op-2:failed"]);
});
