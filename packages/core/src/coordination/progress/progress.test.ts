import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoordinationEvent, TaskContract, WeaveEvent } from "@weave/protocol";
import { Ledger, readLedger } from "../../shared/index.ts";
import { Coordinator } from "../coordinator/index.ts";
import { subtaskIndex } from "../coordinator/subtask-index.ts";
import { parseEmployeeEvent, renderInbox } from "../employee/index.ts";
import { reportedSubtasks } from "./reported-subtasks.ts";

const SUBTASKS = ["Design the User schema", "Design the Todo schema", "Publish the database contract"];

async function coordinatorFor(tasks: readonly TaskContract[]): Promise<{ readonly coordinator: Coordinator; readonly weaveDir: string; readonly runId: string }> {
  const weaveDir = join(await mkdtemp(join(tmpdir(), "weave-progress-")), ".weave");
  const runId = "run1";
  const ledger = new Ledger(weaveDir, runId);
  return { coordinator: new Coordinator({ tasks, ledger, now: () => new Date("2026-01-01T00:00:00Z") }), weaveDir, runId };
}

test("a reported milestone is matched to the one Weave declared, whatever the spacing and case", () => {
  assert.equal(subtaskIndex(SUBTASKS, "Design the Todo schema"), 1);
  assert.equal(subtaskIndex(SUBTASKS, "  design   the todo SCHEMA "), 1);
  assert.equal(subtaskIndex(SUBTASKS, "write some tests"), null);
  assert.equal(subtaskIndex([], "anything"), null);
});

test("a worker reports a milestone and only Weave is told, so other workers keep their inboxes clean", async () => {
  const tasks: readonly TaskContract[] = [
    { id: "DB", prompt: "db", cwd: "", subtasks: [...SUBTASKS] },
    { id: "API", prompt: "api", cwd: "", dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] },
  ];
  const { coordinator, weaveDir, runId } = await coordinatorFor(tasks);
  const published = coordinator.channelFor("DB").publish({ type: "subtask.completed", data: { subtask: "design the todo schema" } });
  assert.ok(published.ok, published.ok ? "" : published.reason);
  assert.deepEqual(published.ok && published.event.data, { subtask: "design the todo schema", index: 1 });

  const undeclared = coordinator.channelFor("DB").publish({ type: "subtask.completed", data: { subtask: "add an index nobody asked for" } });
  assert.deepEqual(undeclared.ok && undeclared.event.data, { subtask: "add an index nobody asked for", index: null });

  assert.deepEqual(coordinator.channelFor("API").drain().events, []);
  const events = await readLedger(weaveDir, runId);
  const recipients = events.flatMap((event) => (event.type === "coordination.event" && event.event.type === "subtask.completed" ? [event.recipients] : []));
  assert.deepEqual(recipients, [["weave"], ["weave"]]);
});

test("an unknown task cannot report progress", async () => {
  const { coordinator } = await coordinatorFor([{ id: "DB", prompt: "db", cwd: "" }]);
  const refused = coordinator.submit("GHOST", { type: "subtask.completed", data: { subtask: "anything" } });
  assert.deepEqual(refused, { ok: false, reason: "Unknown task GHOST" });
});

test("the milestones a worker already reported are read back from the ledger, once each", async () => {
  const { coordinator, weaveDir, runId } = await coordinatorFor([
    { id: "DB", prompt: "db", cwd: "", subtasks: [...SUBTASKS] },
    { id: "API", prompt: "api", cwd: "", subtasks: ["Write the routes"] },
  ]);
  const db = coordinator.channelFor("DB");
  db.publish({ type: "subtask.completed", data: { subtask: SUBTASKS[0] ?? "" } });
  db.publish({ type: "subtask.completed", data: { subtask: SUBTASKS[0] ?? "" } });
  db.publish({ type: "subtask.completed", data: { subtask: SUBTASKS[1] ?? "" } });
  coordinator.channelFor("API").publish({ type: "subtask.completed", data: { subtask: "Write the routes" } });

  const events = await readLedger(weaveDir, runId);
  assert.deepEqual(reportedSubtasks(events, "DB"), [SUBTASKS[0], SUBTASKS[1]]);
  assert.deepEqual(reportedSubtasks(events, "API"), ["Write the routes"]);
  assert.deepEqual(reportedSubtasks(events, "UI"), []);
  assert.deepEqual(reportedSubtasks([] as readonly WeaveEvent[], "DB"), []);
});

test("a milestone report is parsed strictly, and reads as one line in an inbox", () => {
  assert.deepEqual(parseEmployeeEvent({ type: "subtask.completed", data: { subtask: "Publish the database contract" } }), {
    ok: true,
    submission: { type: "subtask.completed", data: { subtask: "Publish the database contract" } },
  });
  assert.equal(parseEmployeeEvent({ type: "subtask.completed", data: {} }).ok, false);
  assert.equal(parseEmployeeEvent({ type: "subtask.completed", data: { subtask: "x".repeat(201) } }).ok, false);

  const event: CoordinationEvent = {
    id: "e1", version: 1, seq: 1, occurredAt: "t", correlationId: "c", from: "DB",
    type: "subtask.completed", data: { subtask: "Design the\n Todo schema", index: 1 },
  };
  assert.match(renderInbox({ events: [event], droppedCount: 0 }), /\[subtask\.completed\] from DB: finished Design the Todo schema/);
});
