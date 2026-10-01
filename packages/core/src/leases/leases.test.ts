import test from "node:test";
import assert from "node:assert/strict";
import type { SchedulableTask } from "../scheduler/index.ts";
import { LeaseTable } from "./lease-table.ts";
import type { LeaseEvent, LeaseTableOptions } from "./types.ts";

const LEASE_MS = 1_000;
const after = (task: string) => ({ dependencies: [{ task, requiredOutputs: [] }] });

function tableWith(tasks: readonly SchedulableTask[], options: Partial<LeaseTableOptions> = {}) {
  const events: LeaseEvent[] = [];
  const table = new LeaseTable({ tasks, leaseMs: LEASE_MS, maxAttempts: 3, onEvent: (event) => events.push(event), ...options });
  return { table, events };
}

test("tasks are leased in plan order, and a dependent waits until its dependency is verified", () => {
  const { table } = tableWith([{ id: "A" }, { id: "B", ...after("A") }, { id: "C" }]);
  const a = table.claim("w1", 0);
  assert.deepEqual([a?.taskId, table.claim("w2", 0)?.taskId, table.claim("w3", 0)], ["A", "C", null]);
  assert.ok(a);
  assert.ok(table.complete(a, 10).ok);
  assert.equal(table.claim("w3", 10), null, "completed is not verified yet");
  table.verify("A", { ok: true }, 20);
  assert.equal(table.claim("w3", 20)?.taskId, "B");
});

test("heartbeats keep a lease alive past its first expiry, and silence lets another worker take over", () => {
  const { table, events } = tableWith([{ id: "A" }]);
  const first = table.claim("w1", 0);
  assert.ok(first);
  const renewed = table.renew(first, 900);
  assert.deepEqual(renewed.ok && renewed.lease.expiresAtMs, 1_900);
  assert.deepEqual(table.expire(1_500), []);
  assert.deepEqual(table.expire(1_901).map((lease) => lease.workerId), ["w1"]);
  const second = table.claim("w2", 1_901);
  assert.ok(second);
  assert.equal(second.attempt, 2);
  assert.ok(second.token > first.token, "the new holder gets a newer fencing token");
  assert.deepEqual(events.find((event) => event.type === "leased" && event.workerId === "w2"), {
    type: "leased", atMs: 1_901, taskId: "A", workerId: "w2", token: 2, attempt: 2, previousWorkerId: "w1",
  });
});

test("a worker that comes back after losing its lease cannot write its result", () => {
  const { table, events } = tableWith([{ id: "A" }]);
  const zombie = table.claim("w1", 0);
  assert.ok(zombie);
  assert.deepEqual(table.complete(zombie, 5_000), { ok: false, reason: "expired" }, "expired before any sweep ran");
  const taker = table.claim("w2", 5_000);
  assert.ok(taker);
  assert.deepEqual(table.renew(zombie, 5_001), { ok: false, reason: "superseded" });
  assert.deepEqual(table.complete(zombie, 5_002), { ok: false, reason: "superseded" });
  assert.ok(table.complete(taker, 5_100).ok);
  assert.deepEqual(table.complete(taker, 5_101), { ok: false, reason: "finished" }, "a result is accepted once");
  assert.equal(table.recordOf("A")?.state, "verifying");
  assert.deepEqual(events.filter((event) => event.type === "fenced").map((event) => event.type === "fenced" && [event.workerId, event.reason]), [
    ["w1", "expired"], ["w1", "superseded"], ["w2", "finished"],
  ]);
});

test("rejected work is retried until attempts run out, and dependents then fail with the reason", () => {
  const { table, events } = tableWith([{ id: "A" }, { id: "B", ...after("A") }], { maxAttempts: 2 });
  for (const [attempt, at] of [[1, 0], [2, 100]] as const) {
    const lease = table.claim(`w${attempt}`, at);
    assert.equal(lease?.attempt, attempt);
    assert.ok(lease && table.complete(lease, at + 10).ok);
    table.verify("A", { ok: false, reason: "tests failed" }, at + 20);
  }
  assert.equal(table.claim("w3", 200), null);
  assert.ok(table.isFinished());
  assert.deepEqual(table.counts(), { queued: 0, leased: 0, verifying: 0, verified: 0, failed: 2 });
  assert.deepEqual(events.filter((event) => event.type === "failed").map((event) => [event.taskId, event.reason]), [
    ["A", "gave up after 2 attempt(s)"], ["B", "dependency A ended as failed"],
  ]);
});

test("a worker that gives up hands the task back at once, without waiting for its lease to expire", () => {
  const { table } = tableWith([{ id: "A" }]);
  const lease = table.claim("w1", 0);
  assert.ok(lease);
  assert.ok(table.release(lease, "engine unavailable", 10).ok);
  assert.equal(table.claim("w2", 10)?.workerId, "w2");
});

test("a recovered task is leased again before tasks that have not started", () => {
  const { table } = tableWith([{ id: "A" }, { id: "B" }]);
  assert.equal(table.claim("w1", 0)?.taskId, "A");
  table.expire(LEASE_MS + 1);
  assert.equal(table.claim("w2", LEASE_MS + 1)?.taskId, "A");
  assert.equal(table.claim("w3", LEASE_MS + 1)?.taskId, "B");
});

test("a plan with a cycle, an unknown dependency or a repeated id is refused", () => {
  assert.throws(() => tableWith([{ id: "A", ...after("B") }, { id: "B", ...after("A") }]), /cycle/);
  assert.throws(() => tableWith([{ id: "A", ...after("Z") }]), /unknown dependencies: A → Z/);
  assert.throws(() => tableWith([{ id: "A" }, { id: "A" }]), /unique/);
});
