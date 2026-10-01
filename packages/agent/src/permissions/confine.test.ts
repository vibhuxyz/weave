import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestPermissionRequest, TaskContract } from "@weave/protocol";
import { confineToTaskDir } from "./confine.ts";

const TASK: TaskContract = { id: "T2", prompt: "move storage to MongoDB", cwd: "/Users/tester/Coding/todo-app" };

function writeTo(path: string): RequestPermissionRequest {
  return {
    sessionId: "s1",
    options: [
      { optionId: "allow", name: "allow", kind: "allow_once" },
      { optionId: "reject", name: "reject", kind: "reject_once" },
    ],
    toolCall: { toolCallId: "tc-1", kind: "edit", title: "Write", locations: [{ path }] },
  };
}

test("a scratch file in the OS temp folder is allowed, as the sandbox already allows", async () => {
  for (const path of ["/tmp/t2-mongo/server.log", join(tmpdir(), "t2", "db.log")]) {
    assert.equal((await confineToTaskDir(TASK, writeTo(path))).decision, "allow", path);
  }
});

test("other folders outside the project are still refused", async () => {
  const decision = await confineToTaskDir(TASK, writeTo("/Users/tester/Coding/other-app/index.js"));
  assert.equal(decision.decision, "reject");
  assert.match(decision.decision === "reject" ? decision.reason : "", /outside \/Users\/tester\/Coding\/todo-app/);
});
