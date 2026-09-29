import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { runPool, type RunWorker } from "../pool/index.ts";
import { Ledger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { chooseRuntime, requiredCapabilities } from "./capability.ts";
import { manageWorker } from "./manage.ts";
import type { RuntimeProfile, WorkerTrace } from "./types.ts";

async function setup() {
  const repo = await mkdtemp(join(tmpdir(), "weave-worker-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  return { repo, weaveDir, ledger, base: { repoRoot: repo, weaveDir, ledger, shouldInstall: false } };
}

function task(id: string, extra: Partial<TaskContract> = {}): TaskContract {
  return { id, prompt: `write ${id}`, cwd: "", ...extra };
}

function tracker() {
  const state = { active: 0, peak: 0, order: [] as string[] };
  const enter = (id: string) => {
    state.active += 1;
    state.peak = Math.max(state.peak, state.active);
    state.order.push(id);
  };
  const leave = () => {
    state.active -= 1;
  };
  return { state, enter, leave };
}

test("three independent tasks occupy three worker slots at the same time", async () => {
  const { base } = await setup();
  const { state, enter, leave } = tracker();
  const worker: RunWorker = async ({ task: running }) => {
    enter(running.id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    leave();
    return { status: "ok" };
  };

  const report = await runPool({
    ...base,
    tasks: [task("T1"), task("T2"), task("T3")],
    concurrency: 3,
    runWorker: worker,
  });

  assert.equal(state.peak, 3, "all three slots must be busy at once");
  assert.deepEqual(state.order.sort(), ["T1", "T2", "T3"]);
  assert.deepEqual(report.tasks.map((entry) => entry.status), ["ok", "ok", "ok"]);
});

test("five tasks on two slots run two at a time and refill as each finishes", async () => {
  const { base } = await setup();
  const { state, enter, leave } = tracker();
  const worker: RunWorker = async ({ task: running }) => {
    enter(running.id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    leave();
    return { status: "ok" };
  };

  const tasks = ["T1", "T2", "T3", "T4", "T5"].map((id) => task(id));
  const report = await runPool({ ...base, tasks, concurrency: 2, runWorker: worker });

  assert.equal(state.peak, 2, "the two slots must never be exceeded");
  assert.equal(state.order.length, 5, "every queued task must eventually start");
  assert.deepEqual([...state.order].sort(), ["T1", "T2", "T3", "T4", "T5"]);
  assert.ok(report.tasks.every((entry) => entry.status === "ok"));
});

const RUNTIMES: readonly RuntimeProfile[] = [
  { id: "investigator", capabilities: ["repository-investigation"] },
  { id: "web", capabilities: ["frontend"] },
  { id: "api", capabilities: ["backend", "database"] },
  { id: "qa", capabilities: ["testing"] },
  { id: "generalist", capabilities: ["frontend", "backend", "database", "testing", "devops"] },
];

test("the task decides the role, and the narrowest capable runtime is chosen", () => {
  assert.deepEqual(requiredCapabilities(task("T1", { capabilities: ["Backend"] })), ["backend"]);
  assert.deepEqual(
    requiredCapabilities(task("T2", { allowedPaths: ["apps/web/src/**"], prompt: "add a component" })),
    ["frontend"],
  );
  assert.deepEqual(
    requiredCapabilities(task("T3", { prompt: "investigate why sessions drop" })),
    ["repository-investigation"],
  );

  const backend = chooseRuntime(task("T4", { capabilities: ["backend"] }), RUNTIMES, "generalist");
  assert.equal(backend.runtimeId, "api");
  assert.deepEqual(backend.matched, ["backend"]);

  const spread = chooseRuntime(task("T5", { capabilities: ["frontend", "devops"] }), RUNTIMES, "generalist");
  assert.equal(spread.runtimeId, "generalist", "the runtime covering both must win");

  const unmatched = chooseRuntime(task("T6", { capabilities: ["devops"] }), [RUNTIMES[1] as RuntimeProfile], "fallback");
  assert.equal(unmatched.runtimeId, "fallback");
  assert.deepEqual(unmatched.missing, ["devops"]);

  const plain = chooseRuntime(task("T7", { prompt: "rename a variable" }), RUNTIMES, "generalist");
  assert.equal(plain.runtimeId, "generalist");
  assert.equal(plain.reason, "no capability was required");
});

test("a worker that never reports is stopped as stalled and the states are legal", async () => {
  const { base, ledger } = await setup();
  const traces: WorkerTrace[] = [];
  const silent: RunWorker = ({ signal }) =>
    new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ status: "failed", error: "aborted" }), { once: true });
    });

  const managed = manageWorker({
    run: silent,
    defaultRuntimeId: "generalist",
    stallMs: 60,
    onTrace: (trace) => traces.push(trace),
  });

  const report = await runPool({ ...base, tasks: [task("T1")], concurrency: 1, runWorker: managed });
  assert.equal(report.tasks[0]?.status, "failed");
  assert.match(report.tasks[0]?.reason ?? "", /stalled after 60ms/);

  const attempt = traces[0]?.attempts[0];
  assert.equal(attempt?.stoppedBy, "stalled");
  assert.deepEqual(attempt?.statuses, ["created", "starting", "running", "failed"]);
  assert.ok(ledger.seq > 0);
});

test("a worker that keeps reporting is not treated as stalled", async () => {
  const { base } = await setup();
  const beating: RunWorker = async ({ task: running, ledger, signal }) => {
    for (let beat = 0; beat < 5 && !signal.aborted; beat += 1) {
      ledger.append("worker.progress", {
        taskId: running.id,
        workerId: `${running.id}#1`,
        activity: `step ${beat}`,
        completedSteps: beat,
        totalSteps: 5,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { status: "ok" };
  };

  const managed = manageWorker({ run: beating, defaultRuntimeId: "generalist", stallMs: 60 });
  const report = await runPool({ ...base, tasks: [task("T1")], concurrency: 1, runWorker: managed });
  assert.equal(report.tasks[0]?.status, "ok");
});

test("a hung worker is stopped by the timeout even while it reports", async () => {
  const { base } = await setup();
  const traces: WorkerTrace[] = [];
  const chatty: RunWorker = async ({ task: running, ledger, signal }) => {
    while (!signal.aborted) {
      ledger.append("worker.progress", { taskId: running.id, workerId: "w", activity: "busy", completedSteps: 0, totalSteps: null });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { status: "failed", error: "aborted" };
  };

  const managed = manageWorker({
    run: chatty,
    defaultRuntimeId: "generalist",
    timeoutMs: 80,
    stallMs: 1000,
    onTrace: (trace) => traces.push(trace),
  });
  const report = await runPool({ ...base, tasks: [task("T1")], concurrency: 1, runWorker: managed });
  assert.equal(report.tasks[0]?.status, "failed");
  assert.match(report.tasks[0]?.reason ?? "", /timed out after 80ms/);
  assert.equal(traces[0]?.attempts[0]?.stoppedBy, "timeout");
});

test("a retryable failure is retried, a permanent one is not", async () => {
  const { base } = await setup();
  let calls = 0;
  const flaky: RunWorker = async () => {
    calls += 1;
    return calls === 1 ? { status: "failed", error: "engine overloaded" } : { status: "ok" };
  };
  const traces: WorkerTrace[] = [];
  const managed = manageWorker({
    run: flaky,
    defaultRuntimeId: "generalist",
    retry: { maxAttempts: 3, backoffMs: 1 },
    onTrace: (trace) => traces.push(trace),
  });
  const report = await runPool({ ...base, tasks: [task("T1")], concurrency: 1, runWorker: managed });
  assert.equal(report.tasks[0]?.status, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(traces[0]?.attempts.map((entry) => entry.status), ["failed", "ok"]);
  assert.deepEqual(traces[0]?.attempts.map((entry) => entry.workerId), ["T1#1", "T1#2"]);

  let permanent = 0;
  const broken: RunWorker = async () => {
    permanent += 1;
    return { status: "failed", error: "the prompt is invalid" };
  };
  const managedBroken = manageWorker({ run: broken, defaultRuntimeId: "generalist", retry: { maxAttempts: 3, backoffMs: 1 } });
  const second = await runPool({ ...base, tasks: [task("T2")], concurrency: 1, runWorker: managedBroken });
  assert.equal(second.tasks[0]?.status, "failed");
  assert.equal(permanent, 1, "a permanent failure must not be retried");
});

test("a timed out worker is retried, and the second attempt can succeed", async () => {
  const { base } = await setup();
  let calls = 0;
  const slowThenFast: RunWorker = async ({ signal }) => {
    calls += 1;
    if (calls === 1) {
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve({ status: "failed", error: "aborted" }), { once: true });
      });
    }
    return { status: "ok" };
  };
  const managed = manageWorker({
    run: slowThenFast,
    defaultRuntimeId: "generalist",
    timeoutMs: 50,
    retry: { maxAttempts: 2, backoffMs: 0 },
  });
  const report = await runPool({ ...base, tasks: [task("T1")], concurrency: 1, runWorker: managed });
  assert.equal(report.tasks[0]?.status, "ok");
  assert.equal(calls, 2, "a timeout must be retryable");
});

test("a crashing worker is caught, reported and retried as a fresh worker", async () => {
  const { base } = await setup();
  let calls = 0;
  const crashing: RunWorker = async () => {
    calls += 1;
    if (calls === 1) throw new Error("engine crashed hard");
    return { status: "ok" };
  };
  const managed = manageWorker({ run: crashing, defaultRuntimeId: "generalist", retry: { maxAttempts: 2, backoffMs: 0 } });
  const report = await runPool({ ...base, tasks: [task("T1")], concurrency: 1, runWorker: managed });
  assert.equal(report.tasks[0]?.status, "ok");
  assert.equal(calls, 2);
});
