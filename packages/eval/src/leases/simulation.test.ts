import test from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_SCENARIOS, runBenchmark } from "./benchmark.ts";
import { parseCliOptions } from "./cli-options.ts";
import { DEFAULT_CONFIG } from "./constants.ts";
import { EventQueue } from "./engine/event-queue.ts";
import { simulate } from "./engine/index.ts";
import { metricsOf } from "./report/index.ts";
import type { SimulationConfig } from "./types.ts";

const run = (changes: Partial<SimulationConfig> = {}) => {
  const result = simulate({ ...DEFAULT_CONFIG, ...changes });
  return { result, metrics: metricsOf(result) };
};

test("100 tasks on 20 workers: crashed and hung workers' tasks are taken over by other workers and all verified", () => {
  const { result, metrics } = run();
  assert.deepEqual(metrics.violations, []);
  assert.equal(metrics.verified, 100);
  assert.ok(metrics.crashes > 0 && metrics.hangs > 0, "the default scenario injects both kinds of fault");
  assert.equal(metrics.takeovers, metrics.crashes + metrics.hangs);
  for (const recovery of metrics.recoveries) {
    assert.notEqual(recovery.takenOverBy, recovery.lostWorkerId, `${recovery.taskId} went to another worker`);
    assert.ok(recovery.expiredAtMs !== null && recovery.expiredAtMs - recovery.lostAtMs <= DEFAULT_CONFIG.leaseMs + DEFAULT_CONFIG.sweepMs, "expiry comes within one lease and one sweep");
    assert.ok(recovery.verifiedAtMs !== null);
  }
  assert.ok(result.heartbeats > 0);
});

test("a hung worker that wakes up never gets its result accepted", () => {
  const { metrics } = run({ hangRate: 0.3, crashRate: 0 });
  const hung = metrics.recoveries.filter((recovery) => recovery.cause === "hung");
  assert.ok(hung.length > 10);
  assert.ok(hung.every((recovery) => recovery.lateWrite !== null), "every late write was blocked");
  assert.deepEqual(metrics.violations, []);
});

test("the same seed replays exactly, and another seed gives another run", () => {
  assert.deepEqual(run().result.events, run().result.events);
  assert.notDeepEqual(run({ seed: "other" }).result.events, run().result.events);
});

test("without faults nothing expires or is taken over", () => {
  const { metrics } = run({ crashRate: 0, hangRate: 0, wrongOutputRate: 0 });
  assert.deepEqual([metrics.verified, metrics.expiries, metrics.takeovers, metrics.fenced, metrics.rejected], [100, 0, 0, 0, 0]);
});

test("a heartbeat slower than the lease costs healthy workers their tasks, but ownership stays safe", () => {
  const { metrics } = run({ heartbeatMs: 4_000, crashRate: 0, hangRate: 0, wrongOutputRate: 0, maxAttempts: 50 });
  assert.ok(metrics.expiries > 0, "healthy workers lose leases they could not renew in time");
  assert.deepEqual(metrics.violations, []);
});

test("when attempts run out, the task and its dependents fail, and the run still ends", () => {
  const { metrics } = run({ crashRate: 0.7, maxAttempts: 2 });
  assert.ok(metrics.failed > 0);
  assert.equal(metrics.verified + metrics.failed, 100);
  assert.deepEqual(metrics.violations, []);
});

test("the event queue orders by time, then by insertion", () => {
  const queue = new EventQueue<string>();
  for (const [atMs, item] of [[5, "c"], [1, "a"], [5, "d"], [1, "b"], [0, "start"]] as const) queue.push(atMs, item);
  const order = Array.from({ length: queue.size }, () => queue.pop()?.item);
  assert.deepEqual(order, ["start", "a", "b", "c", "d"]);
  assert.equal(queue.pop(), null);
});

test("the benchmark covers every scenario with no broken invariants, and more workers finish sooner", () => {
  const rows = runBenchmark(DEFAULT_CONFIG, 1);
  assert.deepEqual(rows.map((row) => row.label), BENCHMARK_SCENARIOS.map((scenario) => scenario.label));
  assert.ok(rows.every((row) => row.violations === 0));
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  assert.ok((byLabel.get("20 workers")?.makespanMs ?? Infinity) < (byLabel.get("1 worker")?.makespanMs ?? 0));
  assert.ok((byLabel.get("20 workers, lease 1s")?.recoveryP50Ms ?? Infinity) < (byLabel.get("20 workers, lease 10s")?.recoveryP50Ms ?? 0));
});

test("options are checked before anything runs", () => {
  assert.deepEqual(parseCliOptions(["--crash", "2"]), { ok: false, reason: "--crash must be between 0 and 1, got 2" });
  assert.deepEqual(parseCliOptions(["--crash", "0.6", "--hang", "0.5"]), { ok: false, reason: "--crash, --hang and --wrong must add up to at most 1" });
  assert.equal(parseCliOptions(["--nope"]).ok, false);
  const bench = parseCliOptions(["--bench", "--runs", "3", "--tasks", "50"]);
  assert.deepEqual(bench.ok && bench.mode.kind === "bench" ? [bench.mode.runs, bench.mode.config.tasks] : null, [3, 50]);
});
