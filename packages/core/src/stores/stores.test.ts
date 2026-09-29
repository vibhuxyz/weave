import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Artifact, WeaveEvent } from "@weave/protocol";
import { Ledger, readLedger } from "../shared/index.ts";
import { ArtifactsStore } from "./artifacts-store.ts";
import { RunsStore } from "./runs-store.ts";
import { TasksStore } from "./tasks-store.ts";
import { WorkersStore } from "./workers-store.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-01T00:05:00.000Z";

const ARTIFACT: Artifact = {
  name: "orders-api",
  version: 1,
  summary: "REST contract for orders",
  provides: ["POST /v1/orders"],
  files: [{ path: "docs/orders-api.md", content: "# Orders" }],
};

async function weaveDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "weave-stores-"));
}

test("a run, task, worker and artifact are created, persisted and read back", async () => {
  const dir = await weaveDir();
  try {
    const runs = new RunsStore(dir);
    const tasks = new TasksStore(dir);
    const workers = new WorkersStore(dir);
    const artifacts = new ArtifactsStore(dir);

    const run = await runs.create({
      id: "run-1",
      prompt: "add orders api",
      branch: "main",
      repository: { root: "/repo", remote: null, baseCommit: "abc1234" },
      configuration: { mode: "parallel", maxWorkers: 3, engineId: "claude", sandboxed: true },
      now: NOW,
    });
    assert.equal(run.status, "pending");

    const task = await tasks.create("task-1", "add orders api", "/repo", "claude", "sess-1", run.id, 0);
    const worker = await workers.create({
      id: "worker-1",
      runId: run.id,
      taskId: task.id,
      runtime: { engineId: "claude", model: "claude-opus-5", employeeId: null },
      now: NOW,
    });
    const artifact = await artifacts.create({
      id: "artifact-1",
      runId: run.id,
      type: "api-contract",
      producer: task.id,
      artifact: ARTIFACT,
      now: NOW,
    });

    assert.equal(worker.status, "created");
    assert.equal(artifact.status, "draft");

    assert.deepEqual(await runs.get(run.id), run);
    assert.deepEqual(await tasks.get(task.id), task);
    assert.deepEqual(await workers.get(run.id, worker.id), worker);
    assert.deepEqual(await artifacts.get(run.id, artifact.id), artifact);

    assert.deepEqual((await runs.list()).map((each) => each.id), ["run-1"]);
    assert.deepEqual((await workers.list(run.id)).map((each) => each.id), ["worker-1"]);
    assert.deepEqual((await artifacts.list(run.id)).map((each) => each.id), ["artifact-1"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("status changes are persisted with their timestamps", async () => {
  const dir = await weaveDir();
  try {
    const runs = new RunsStore(dir);
    const workers = new WorkersStore(dir);
    const artifacts = new ArtifactsStore(dir);

    await runs.create({
      id: "run-2",
      prompt: "ship it",
      branch: null,
      repository: { root: "/repo", remote: "git@example.com:repo.git", baseCommit: null },
      configuration: { mode: "sequential", maxWorkers: 1, engineId: null, sandboxed: false },
      now: NOW,
    });
    await workers.create({
      id: "worker-2",
      runId: "run-2",
      taskId: "task-2",
      runtime: { engineId: "claude", model: null, employeeId: "backend" },
      now: NOW,
    });
    await artifacts.create({
      id: "artifact-2",
      runId: "run-2",
      type: "test-plan",
      producer: "task-2",
      artifact: ARTIFACT,
      now: NOW,
    });

    const running = await workers.update(
      "run-2",
      "worker-2",
      { status: "running", currentActivity: "writing routes", completedSteps: 1, totalSteps: 4 },
      NOW,
    );
    assert.equal(running.startedAt, NOW);
    assert.equal(running.finishedAt, null);
    assert.deepEqual(running.progress, { completedSteps: 1, totalSteps: 4 });

    const done = await workers.update("run-2", "worker-2", { status: "completed" }, LATER);
    assert.equal(done.finishedAt, LATER);
    assert.equal(done.currentActivity, "writing routes");

    const finished = await runs.setStatus("run-2", "completed", LATER);
    assert.equal(finished.finishedAt, LATER);

    const published = await artifacts.publish("run-2", "artifact-2", { ...ARTIFACT, version: 2 }, LATER);
    assert.equal(published.status, "ready");
    assert.equal(published.artifact.version, 2);

    const rejected = await artifacts.setStatus("run-2", "artifact-2", "rejected", LATER);
    assert.equal(rejected.status, "rejected");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lifecycle events are appended to the run ledger and read back in order", async () => {
  const dir = await weaveDir();
  try {
    const ledger = new Ledger(dir, "run-3");
    ledger.append("task.created", {
      taskId: "task-3",
      title: "add orders api",
      dependsOn: [],
      allowedPaths: ["apps/api/**"],
    });
    ledger.append("worker.started", {
      workerId: "worker-3",
      taskId: "task-3",
      engineId: "claude",
      workspace: "/tmp/wt",
    });
    ledger.append("worker.progress", {
      workerId: "worker-3",
      activity: "writing routes",
      completedSteps: 1,
      totalSteps: 4,
    });
    ledger.append("artifact.created", {
      artifactId: "artifact-3",
      artifactType: "api-contract",
      name: "orders-api",
      producer: "task-3",
      version: 1,
    });
    ledger.append("artifact.ready", {
      artifactId: "artifact-3",
      name: "orders-api",
      version: 1,
      provides: ["POST /v1/orders"],
    });
    ledger.append("dependency.blocked", {
      taskId: "task-4",
      on: "task-3",
      outputs: ["orders-api"],
      reason: "producer still running",
    });
    ledger.append("dependency.ready", { taskId: "task-4", on: "task-3", outputs: ["orders-api"] });
    ledger.append("test.started", { command: "bun test" });
    ledger.append("test.passed", { command: "bun test", wallMs: 1200, total: 42 });
    ledger.append("integration.started", { branch: "weave/run-3", candidates: ["task-3"] });
    ledger.append("worker.completed", { workerId: "worker-3", status: "completed", wallMs: 5000 });

    const events: WeaveEvent[] = await readLedger(dir, "run-3");
    assert.deepEqual(
      events.map((event) => event.type),
      [
        "task.created",
        "worker.started",
        "worker.progress",
        "artifact.created",
        "artifact.ready",
        "dependency.blocked",
        "dependency.ready",
        "test.started",
        "test.passed",
        "integration.started",
        "worker.completed",
      ],
    );
    assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.ok(events.every((event) => event.runId === "run-3"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
