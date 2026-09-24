import test from "node:test";
import assert from "node:assert/strict";
import type { ToolEntry } from "@/features/chat/hooks";
import { collectTasks, taskStateOf } from "./collect-tasks";

const tool = (id: string, status: ToolEntry["status"], fields: Partial<ToolEntry> = {}): ToolEntry => ({ id, title: id, kind: "execute", status, ...fields });

test("tasks from every turn split into running and finished, newest first", () => {
  const tasks = collectTasks([{ tools: [tool("a", "completed"), tool("b", "in_progress")] }, { tools: [tool("c", "failed"), tool("d", "pending")] }]);
  assert.deepEqual(tasks.running.map((entry) => entry.id), ["d", "b"]);
  assert.deepEqual(tasks.finished.map((entry) => entry.id), ["c", "a"]);
});

test("a call the turn abandoned counts as stopped, not running", () => {
  assert.equal(taskStateOf(tool("x", "in_progress", { interrupted: true })), "stopped");
});
