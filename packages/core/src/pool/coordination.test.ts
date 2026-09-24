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

test("exit: a dependent consumes an intermediate artifact while its upstream is still running", async () => {
  const { weaveDir, ledger, base } = await setup();
  const timeline: string[] = [];
  const inboxes = new Map<string, InboxBatch>();
  const apiStarted = gate("api");
  const uiStarted = gate("ui");
  const worker: RunWorker = async ({ task, ledger: runLedger, coordination }) => {
    timeline.push(`${task.id}:start`);
    inboxes.set(task.id, coordination.drain());
    if (task.id === "DB") {
      for (const text of schemaBlock) runLedger.append("agent.message", { taskId: task.id, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });
      await apiStarted.wait();
    }
    if (task.id === "API") {
      apiStarted.open();
      coordination.publish({ type: "contract.published", data: { artifact: { name: "orders-api", summary: "GET /v1/orders", files: [] } } });
      await uiStarted.wait();
    }
    if (task.id === "UI") uiStarted.open();
    await writeOwnFile(task, `${task.id.toLowerCase()}/index.ts`);
    timeline.push(`${task.id}:end`);
    return { status: "ok" };
  };
  const tasks: TaskContract[] = [
    { id: "DB", prompt: "db", cwd: "", allowedPaths: ["db/**"] },
    { id: "API", prompt: "api", cwd: "", allowedPaths: ["api/**"], dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] },
    { id: "UI", prompt: "ui", cwd: "", allowedPaths: ["ui/**"], dependencies: [{ task: "API", requiredOutputs: ["orders-api"] }] },
  ];
  const report = await runPool({ ...base, tasks, concurrency: 3, runWorker: worker });

  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [["DB", "ok"], ["API", "ok"], ["UI", "ok"]]);
  assert.ok(timeline.indexOf("API:start") < timeline.indexOf("DB:end"));
  assert.ok(timeline.indexOf("UI:start") < timeline.indexOf("API:end"));
  const apiInbox = inboxes.get("API")?.events ?? [];
  assert.deepEqual(apiInbox.map((event) => event.type), ["task.started", "artifact.ready", "dependency.ready"]);
  const schema = apiInbox.find((event) => event.type === "artifact.ready");
  assert.equal(schema?.type === "artifact.ready" ? schema.data.artifact.files[0]?.content : null, "create table orders (id text)");
  assert.ok((inboxes.get("UI")?.events ?? []).some((event) => event.type === "contract.published"));
  const published = (await readLedger(weaveDir, ledger.runId)).flatMap((event) => (event.type === "coordination.event" ? [event.event.type] : []));
  assert.ok(published.includes("artifact.ready") && published.includes("contract.published") && published.includes("task.completed"));
});

test("a task whose claim overlaps a running owner waits as blocked, then runs", async () => {
  const { weaveDir, ledger, base } = await setup();
  let active = 0;
  let peak = 0;
  const worker: RunWorker = async ({ task }) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
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
  assert.equal(peak, 1);
  const blocked = (await readLedger(weaveDir, ledger.runId)).filter((event) => event.type === "ownership.blocked");
  assert.deepEqual(blocked.map((event) => event.taskId), ["B"]);
});

test("a consumer that built on a producer's artifact fails when that producer fails", async () => {
  const { weaveDir, ledger, base } = await setup();
  const consumerDone = gate("consumer");
  const worker: RunWorker = async ({ task, coordination }) => {
    if (task.id === "DB") {
      coordination.publish({ type: "artifact.ready", data: { artifact: { name: "schema", summary: "s", files: [] } } });
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
