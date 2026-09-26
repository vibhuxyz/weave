import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkerCount } from "./worker-limits.ts";

const ROOMY = { requested: 3, maxWorkers: 4, machineCapacity: 8, affordable: null } as const;

test("the plan decides the worker count when nothing else is tighter", () => {
  const count = resolveWorkerCount(ROOMY);
  assert.deepEqual({ workers: count.workers, limitedBy: count.limitedBy }, { workers: 3, limitedBy: "plan" });
  assert.equal(count.reason, "3 workers: the plan asks for 3");
});

test("the project setting, the machine and the cost limits each cap the count", () => {
  assert.equal(resolveWorkerCount({ ...ROOMY, requested: 6, maxWorkers: 4 }).limitedBy, "setting");
  assert.equal(resolveWorkerCount({ ...ROOMY, requested: 6, machineCapacity: 2 }).workers, 2);
  assert.equal(resolveWorkerCount({ ...ROOMY, requested: 6, machineCapacity: 2 }).limitedBy, "machine");
  const budgeted = resolveWorkerCount({ ...ROOMY, affordable: 1 });
  assert.equal(budgeted.workers, 1);
  assert.equal(budgeted.limitedBy, "budget");
  assert.match(budgeted.reason, /the cost limits afford 1/);
});

test("every constraint that binds is named, in a fixed order", () => {
  const count = resolveWorkerCount({ requested: 2, maxWorkers: 2, machineCapacity: 8, affordable: 2 });
  assert.equal(count.limitedBy, "plan");
  assert.equal(count.reason, "2 workers: the plan asks for 2, this project allows 2 at a time, the cost limits afford 2");
});

test("no constraint can drive the count below one worker", () => {
  const count = resolveWorkerCount({ requested: 0, maxWorkers: 0, machineCapacity: 0, affordable: 0 });
  assert.equal(count.workers, 1);
});
