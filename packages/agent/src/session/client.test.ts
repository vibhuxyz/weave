import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TaskContract } from "@weave/protocol";
import { SessionClient } from "./client.ts";
import type { SessionSink } from "./types.ts";

const sink: SessionSink = {
  onUpdate() {},
  onPermission() {},
  onFileRead() {},
  onFileWritten() {},
  onSpawned() {},
  onSession() {},
  onCapabilities() {},
};

function client(cwd: string): SessionClient {
  const task: TaskContract = { id: "plan", prompt: "plan the work", cwd };
  return new SessionClient({ task, sink, policy: () => ({ decision: "reject", reason: "unused" }) });
}

test("a read outside the task dir is refused and says not to retry", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "weave-task-"));
  const outside = join(tmpdir(), "weave-schema", "parse-task.ts");
  await assert.rejects(
    () => client(cwd).readTextFile({ sessionId: "s", path: outside }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Refused path outside the task dir:/);
      assert.match(error.message, /Do not retry this path/);
      assert.equal(error.message.includes(cwd), false);
      return true;
    },
  );
});
