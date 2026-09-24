import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBenchmark } from "./benchmark.ts";
import { compareRuns } from "./summarize.ts";
import type { ScenarioRun } from "./types.ts";

const run = (scenarioId: string, isOk: boolean, wallMs: number, costMicroUsd: bigint): ScenarioRun => ({
  scenarioId, shape: "pair", policy: "baseline", workers: 1, isOk, failure: isOk ? null : "failed", wallMs, costMicroUsd,
});

test("a policy that loses a scenario the baseline passed is a regression, whatever it saves", () => {
  const baseline = [run("s1", true, 100, 100n), run("s2", true, 100, 100n)];
  const faster = [run("s1", true, 50, 50n), run("s2", false, 50, 50n)];
  assert.equal(compareRuns(baseline, faster).verdict, "regressed");
  assert.deepEqual(compareRuns(baseline, faster).lostScenarios, ["s2"]);
  const same = compareRuns(baseline, [run("s1", true, 99, 100n), run("s2", true, 100, 99n)]);
  assert.equal(same.verdict, "no-improvement");
});

test("exit: learned orchestration beats the fixed heuristic on held-out scenarios without losing any", async () => {
  const workDir = await mkdtemp(join(tmpdir(), "weave-bench-test-"));
  try {
    const result = await runBenchmark({ seed: "exit", trainCount: 10, testCount: 5, maxWorkers: 4, msPerUnit: 25, workDir });
    assert.ok(result.stats.runs >= 10);
    assert.deepEqual(result.comparison.lostScenarios, []);
    assert.ok(result.comparison.adaptive.passed >= result.comparison.baseline.passed);
    assert.equal(result.comparison.verdict, "improved", JSON.stringify({ ...result.comparison, baseline: undefined, adaptive: undefined }));
    assert.ok(result.comparison.improved.includes("cost"));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
