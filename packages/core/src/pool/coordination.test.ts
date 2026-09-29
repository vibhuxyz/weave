import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import type { InboxBatch } from "../coordination/index.ts";
import { Ledger, readLedger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { runPool } from "./pool.ts";
import type { RunWorker } from "./types.ts";

const GATE_TIMEOUT_MS = 5_000;

async function setup() {
  const repo = await mkdtemp(join(tmpdir(), "weave-live-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  return { weaveDir, ledger, base: { repoRoot: repo, weaveDir, ledger, shouldInstall: false } };
}

function gate(label: string): { readonly wait: () => Promise<void>; readonly open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  const wait = async (): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`gate ${label} never opened`)), GATE_TIMEOUT_MS);
    });
    try {
      await Promise.race([opened, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
  return { wait, open };
}

async function writeOwnFile(task: TaskContract, name: string): Promise<void> {
  await mkdir(dirname(join(task.cwd, name)), { recursive: true });
  await writeFile(join(task.cwd, name), `${task.id}\n`);
}

const schemaBlock = [
  "Schema is ready.\n```weave-ev",
  'ent\n{ "type": "artifact.ready", "data": { "artifact": { "name": "schema", "summary": "orders table", "files": [{ "path": "db/schema.sql", "content": "create table orders (id text)" }] } } }\n```\n',
];

test("exit: every worker starts at once, and each one waits only for the output it asked for", async () => {
  const { weaveDir, ledger, base } = await setup();
  const timeline: string[] = [];
  const received = new Map<string, readonly string[]>();
  const allStarted = gate("all");
  let started = 0;

  async function waitForOutput(coordination: Parameters<RunWorker>[0]["coordination"], taskId: string): Promise<void> {
    const deadline = Date.now() + GATE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const names = coordination.drain().events.flatMap((event) => ("artifact" in event.data ? [event.data.artifact.name] : []));
      if (names.length > 0) {
        received.set(taskId, names);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`${taskId} never received the output it asked for`);
  }

  const worker: RunWorker = async ({ task, ledger: runLedger, coordination }) => {
    timeline.push(`${task.id}:start`);
    started += 1;
    if (started === 3) allStarted.open();
    await allStarted.wait();
    timeline.push(`${task.id}:own-work`);

    if (task.id === "DB") {
      for (const text of schemaBlock) runLedger.append("agent.message", { taskId: task.id, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });
    }
    if (task.id === "API") {
      await waitForOutput(coordination, task.id);
      coordination.publish({ type: "contract.published", data: { artifact: { name: "orders-api", summary: "GET /v1/orders", provides: [], files: [] } } });
    }
    if (task.id === "UI") await waitForOutput(coordination, task.id);
    await writeOwnFile(task, `${task.id.toLowerCase()}/index.ts`);
    timeline.push(`${task.id}:end`);
    return { status: "ok" };
  };

  const tasks: TaskContract[] = [
    { id: "DB", prompt: "db", cwd: "", allowedPaths: ["db/**"], produces: ["schema"] },
    { id: "API", prompt: "api", cwd: "", allowedPaths: ["api/**"], produces: ["orders-api"], dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] },
    { id: "UI", prompt: "ui", cwd: "", allowedPaths: ["ui/**"], dependencies: [{ task: "API", requiredOutputs: ["orders-api"] }] },
  ];
  const report = await runPool({ ...base, tasks, concurrency: 3, runWorker: worker });

  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [["DB", "ok"], ["API", "ok"], ["UI", "ok"]]);
  const firstEnd = timeline.findIndex((entry) => entry.endsWith(":end"));
  for (const taskId of ["DB", "API", "UI"]) {
    assert.ok(timeline.indexOf(`${taskId}:start`) < firstEnd, `${taskId} started only after another worker finished: ${timeline.join(" ")}`);
  }
  assert.deepEqual(received.get("API"), ["schema"], "API got the schema while DB was still running");
  assert.deepEqual(received.get("UI"), ["orders-api"], "UI got the contract while API was still running");
  assert.ok(timeline.indexOf("UI:own-work") < timeline.indexOf("API:end"), `UI waited for API to finish: ${timeline.join(" ")}`);

  const published = (await readLedger(weaveDir, ledger.runId)).flatMap((event) => (event.type === "coordination.event" ? [event.event.type] : []));
  assert.ok(published.includes("artifact.ready") && published.includes("contract.published") && published.includes("task.completed"));
});

test("a task whose claim overlaps a running owner runs concurrently in an isolated worktree", async () => {
  const { weaveDir, ledger, base } = await setup();
  let active = 0;
  let peak = 0;
  const worker: RunWorker = async ({ task }) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await writeOwnFile(task, `src/${task.id}.ts`);
    active -= 1;
    return { status: "ok" };
  };
  const tasks: TaskContract[] = [
    { id: "A", prompt: "a", cwd: "", allowedPaths: ["src/**"] },
    { id: "B", prompt: "b", cwd: "", allowedPaths: ["src/B.ts"] },
  ];
  const report = await runPool({ ...base, tasks, concurrency: 2, runWorker: worker });
  assert.deepEqual(report.tasks.map((entry) => entry.status), ["ok", "ok"]);
  assert.equal(peak, 2);
  const blocked = (await readLedger(weaveDir, ledger.runId)).filter((event) => event.type === "ownership.blocked");
  assert.equal(blocked.length, 0);
  
  // B ran isolated, so it produced a harvest event. A ran in shared workspace.
  const harvested = (await readLedger(weaveDir, ledger.runId)).filter((event) => event.type === "worktree.harvested");
  assert.deepEqual(harvested.map((event) => event.type === "worktree.harvested" && [event.taskId, event.files]).sort(), [
    ["B", ["src/B.ts"]],
  ]);
});

test("a consumer that built on a producer's artifact fails when that producer fails", async () => {
  const { weaveDir, ledger, base } = await setup();
  const consumerDone = gate("consumer");
  const worker: RunWorker = async ({ task, coordination }) => {
    if (task.id === "DB") {
      coordination.publish({ type: "artifact.ready", data: { artifact: { name: "schema", summary: "s", provides: [], files: [] } } });
      await consumerDone.wait();
      return { status: "failed", error: "migration broke" };
    }
    coordination.drain();
    await writeOwnFile(task, "api.ts");
    consumerDone.open();
    return { status: "ok" };
  };
  const tasks: TaskContract[] = [
    { id: "DB", prompt: "db", cwd: "" },
    { id: "API", prompt: "api", cwd: "", dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] },
  ];
  const report = await runPool({ ...base, tasks, concurrency: 2, runWorker: worker });
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [["DB", "failed"], ["API", "failed"]]);
  assert.match(report.tasks[1]?.reason ?? "", /consumed work from DB/);
  const invalidated = (await readLedger(weaveDir, ledger.runId)).filter((event) => event.type === "consumer.invalidated");
  assert.deepEqual(invalidated.map((event) => event.taskId), ["API"]);
});

test("exit: a worker asks for an output, keeps working, and continues the moment it arrives", async () => {
  const { weaveDir, ledger, base } = await setup();
  const timeline: string[] = [];
  const requested = gate("requested");
  const delivered = new Map<string, readonly string[]>();
  const worker: RunWorker = async ({ task, coordination }) => {
    timeline.push(`${task.id}:start`);
    if (task.id === "API") {
      coordination.publish({ type: "subtask.completed", data: { subtask: "Sketch the routes" } });
      coordination.publish({ type: "dependency.blocked", data: { need: { output: "schema" }, reason: "need the Todo columns" } });
      requested.open();
      timeline.push("API:asked");
      for (let round = 0; round < 50; round += 1) {
        const batch = coordination.drain();
        const names = batch.events.flatMap((event) => ("artifact" in event.data ? [event.data.artifact.name] : []));
        if (names.length > 0) {
          delivered.set(task.id, names);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      timeline.push("API:continued");
    }
    if (task.id === "DB") {
      await requested.wait();
      coordination.publish({ type: "subtask.completed", data: { subtask: "Design the Todo schema" } });
      coordination.publish({ type: "artifact.ready", data: { artifact: { name: "schema", summary: "todos table", provides: ["Todo"], files: [{ path: "db/schema.sql", content: "create table todos (id text)" }] } } });
      timeline.push("DB:published");
      await new Promise((resolve) => setTimeout(resolve, 40));
      coordination.publish({ type: "subtask.completed", data: { subtask: "Write the migration" } });
      timeline.push("DB:migrated");
    }
    await writeOwnFile(task, `${task.id.toLowerCase()}/index.ts`);
    timeline.push(`${task.id}:end`);
    return { status: "ok" };
  };
  const tasks: TaskContract[] = [
    { id: "DB", prompt: "db", cwd: "", allowedPaths: ["db/**"], produces: ["schema"], subtasks: ["Design the Todo schema", "Write the migration"] },
    { id: "API", prompt: "api", cwd: "", allowedPaths: ["api/**"], subtasks: ["Sketch the routes", "Use the schema"] },
  ];
  const report = await runPool({ ...base, tasks, concurrency: 2, runWorker: worker });

  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [["DB", "ok"], ["API", "ok"]]);
  assert.deepEqual(delivered.get("API"), ["schema"]);
  assert.ok(timeline.indexOf("API:continued") < timeline.indexOf("DB:migrated"), `API waited for the whole producer: ${timeline.join(" ")}`);
  assert.ok(timeline.indexOf("API:continued") < timeline.indexOf("DB:end"));

  const events = await readLedger(weaveDir, ledger.runId);
  const coordination = events.flatMap((event) => (event.type === "coordination.event" ? [event.event] : []));
  const milestones = coordination.flatMap((event) => (event.type === "subtask.completed" ? [[event.from, event.data.subtask, event.data.index]] : []));
  assert.deepEqual(milestones, [
    ["API", "Sketch the routes", 0],
    ["DB", "Design the Todo schema", 0],
    ["DB", "Write the migration", 1],
  ]);
  assert.ok(coordination.some((event) => event.type === "dependency.resolved" && event.data.consumer === "API" && event.data.producer === "DB"));
  const added = events.filter((event) => event.type === "dependency.added");
  assert.deepEqual(added.map((event) => (event.type === "dependency.added" ? [event.taskId, event.on] : [])), [["API", "DB"]]);
});
