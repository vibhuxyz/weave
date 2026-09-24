import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoordinationEvent } from "@weave/protocol";
import type { CoordinationChannel, InboxBatch } from "../coordination/index.ts";
import type { AttemptRunner } from "../relay/index.ts";
import { Ledger } from "../shared/index.ts";
import { engineWorker } from "./engine-worker.ts";

const schemaUpdate: CoordinationEvent = {
  id: "e1", version: 1, seq: 1, occurredAt: "2026-01-01T00:00:00Z", correlationId: "e1", from: "DB",
  type: "artifact.updated",
  data: { artifact: { name: "schema", version: 2, summary: "orders gained currency", files: [{ path: "db/schema.sql", content: "currency text" }] } },
};

function scriptedChannel(batches: readonly InboxBatch[]): CoordinationChannel {
  const queue = [...batches];
  return { taskId: "API", publish: () => ({ ok: false, reason: "not used" }), drain: () => queue.shift() ?? { events: [], droppedCount: 0 } };
}

test("an update that arrives while an employee works becomes its next prompt turn", async () => {
  const weaveDir = join(await mkdtemp(join(tmpdir(), "weave-engine-worker-")), ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const prompts: string[] = [];
  const runAttempt: AttemptRunner = async ({ task }) => {
    prompts.push(task.prompt);
    return { status: "ok", stoppedBy: null, error: null, contextUsed: null, contextSize: null, finalMessage: "done" };
  };
  const worker = engineWorker(undefined, undefined, { weaveDir, model: null, runAttempt });
  const empty: InboxBatch = { events: [], droppedCount: 0 };
  const outcome = await worker({
    task: { id: "API", prompt: "build the orders API", cwd: weaveDir },
    ledger,
    signal: new AbortController().signal,
    coordination: scriptedChannel([empty, { events: [schemaUpdate], droppedCount: 0 }, empty]),
  });
  assert.equal(outcome.status, "ok");
  assert.equal(prompts.length, 2);
  assert.match(prompts[0] ?? "", /```weave-event/);
  assert.doesNotMatch(prompts[0] ?? "", /<weave-inbox>/);
  assert.match(prompts[1] ?? "", /<weave-inbox>[\s\S]*artifact\.updated\] from DB: schema v2[\s\S]*currency text/);
});
