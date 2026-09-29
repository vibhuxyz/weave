import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger, readLedger } from "../shared/index.ts";
import { diagnoseRun } from "./fold.ts";
import { renderDiagnosis } from "./render.ts";

async function ledgerWith(write: (ledger: Ledger) => void): Promise<{ dir: string; runId: string }> {
  const dir = await mkdtemp(join(tmpdir(), "weave-diagnose-"));
  const ledger = new Ledger(dir, "run-1");
  write(ledger);
  return { dir, runId: ledger.runId };
}

test("a failing run says which worker failed and why", async () => {
  const { dir, runId } = await ledgerWith((ledger) => {
    ledger.append("attempt.started", { taskId: "T1", attemptIndex: 0, engineId: "claude-code", sessionId: "s1" });
    ledger.append("pool.task.settled", { taskId: "T1", status: "ok", reason: null, installMs: 2000, agentMs: 8000, wallMs: 11000 });
    ledger.append("attempt.started", { taskId: "T2", attemptIndex: 0, engineId: "claude-code", sessionId: "s2" });
    ledger.append("error", { taskId: "T2", where: "engine.spawn", message: "engine exited with code 1" });
    ledger.append("pool.task.settled", { taskId: "T2", status: "failed", reason: "the engine reported no error (tried claude-code)", installMs: 1000, agentMs: 400, wallMs: 1800 });
    ledger.append("run.finished", { status: "failed", wallMs: 13000 });
  });

  try {
    const diagnosis = diagnoseRun(await readLedger(dir, runId));
    assert.equal(diagnosis.status, "failed");
    assert.deepEqual(diagnosis.tasks.map((task) => task.taskId), ["T1", "T2"]);
    assert.deepEqual(diagnosis.failed.map((task) => task.taskId), ["T2"]);

    const failed = diagnosis.failed[0];
    assert.equal(failed?.reason, "the engine reported no error (tried claude-code)");
    assert.deepEqual(failed?.engines, ["claude-code"]);
    assert.deepEqual(failed?.errors, [{ where: "engine.spawn", message: "engine exited with code 1" }]);

    const report = renderDiagnosis(diagnosis);
    assert.match(report, /Why workers failed/);
    assert.match(report, /T2 — failed after 1\.8s, 1 attempt\(s\) on claude-code/);
    assert.match(report, /error in engine\.spawn: engine exited with code 1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failure with no reason is called out, not left blank", async () => {
  const { dir, runId } = await ledgerWith((ledger) => {
    ledger.append("pool.task.settled", { taskId: "T2", status: "failed", reason: null, installMs: 0, agentMs: 0, wallMs: 500 });
    ledger.append("run.finished", { status: "failed", wallMs: 500 });
  });
  try {
    const report = renderDiagnosis(diagnoseRun(await readLedger(dir, runId)));
    assert.match(report, /no reason was recorded — the engine failed without reporting one/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the report shows where the time went, per task and per check", async () => {
  const { dir, runId } = await ledgerWith((ledger) => {
    ledger.append("worktree.installed", { taskId: "T1", status: "ok", command: "npm ci", durationMs: 45000, detail: "" });
    ledger.append("verification.rung", { taskId: "T1", rung: "tests", strength: 8, command: "npm test", ok: false, wallMs: 30000 });
    ledger.append("verification.rung", { taskId: "T1", rung: "typecheck", strength: 3, command: "tsc", ok: true, wallMs: 4000 });
    ledger.append("usage", { taskId: "T1", used: 1, size: 2, costUsd: 0.42 });
    ledger.append("pool.task.settled", { taskId: "T1", status: "failed", reason: "tests failed", installMs: 45000, agentMs: 120000, wallMs: 180000 });
    ledger.append("pool.task.settled", { taskId: "T2", status: "ok", reason: null, installMs: 1000, agentMs: 5000, wallMs: 7000 });
    ledger.append("run.finished", { status: "failed", wallMs: 190000 });
  });

  try {
    const diagnosis = diagnoseRun(await readLedger(dir, runId));
    assert.deepEqual(diagnosis.slowest.map((task) => task.taskId), ["T1", "T2"]);
    assert.equal(diagnosis.costUsd, 0.42);

    const report = renderDiagnosis(diagnosis);
    assert.match(report, /Where the time went/);
    assert.match(report, /install 45\.0s \(25%\) · agent 120\.0s \(67%\)/);
    assert.match(report, /Slowest checks/);
    assert.match(report, /T1 tests 30\.0s FAILED/);
    assert.match(report, /failed check: tests/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clean run says so and still reports its timing", async () => {
  const { dir, runId } = await ledgerWith((ledger) => {
    ledger.append("pool.task.settled", { taskId: "T1", status: "ok", reason: null, installMs: 100, agentMs: 900, wallMs: 1000 });
    ledger.append("run.finished", { status: "ok", wallMs: 1200 });
  });
  try {
    const report = renderDiagnosis(diagnoseRun(await readLedger(dir, runId)));
    assert.match(report, /Every task finished ok\./);
    assert.match(report, /1 task\(s\), 0 not ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a task that never settled is reported rather than omitted", async () => {
  const { dir, runId } = await ledgerWith((ledger) => {
    ledger.append("attempt.started", { taskId: "T9", attemptIndex: 0, engineId: "codex", sessionId: "s" });
    ledger.append("task.timeout", { taskId: "T9", reason: "timeoutMs", turns: 40, wallMs: 600000 });
  });
  try {
    const diagnosis = diagnoseRun(await readLedger(dir, runId));
    assert.equal(diagnosis.tasks[0]?.status, "did not finish");
    assert.match(renderDiagnosis(diagnosis), /timeout: timeoutMs after 40 turns/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
