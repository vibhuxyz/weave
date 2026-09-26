import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { readLedger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { planAndRun } from "./plan-and-run.ts";
import { detectProjectKind } from "./project-kind.ts";
import type { TurnRunner } from "./types.ts";

async function repoWith(files: Readonly<Record<string, string>>): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-orchestrate-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  for (const [name, content] of Object.entries({ ".gitignore": ".weave/\nnode_modules/\n", ...files })) {
    await writeFile(join(repo, name), content);
  }
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const fenced = (value: unknown) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["tests"], detail: "ok" });
const exists = (path: string) => access(path).then(() => true, () => false);

test("project kind: docs-only repos are greenfield, repos with code are existing", async () => {
  assert.equal(await detectProjectKind(await repoWith({ "README.md": "# idea" })), "greenfield");
  assert.equal(await detectProjectKind(await repoWith({ "index.js": "1" })), "existing");
});

test("existing repo: one prompt becomes a graph that runs unedited, in parallel when paths are disjoint", async () => {
  const repo = await repoWith({ "package.json": JSON.stringify({ scripts: { test: "node --test" } }) });
  const answer = fenced({
    tasks: ["add", "sub", "mul"].map((name, index) => ({
      id: `T${index + 1}`, title: name, prompt: `write ${name}`, allowedPaths: [`${name}.js`],
    })),
  });
  const turns: string[] = [];
  const runTurn: TurnRunner = async (prompt) => (turns.push(prompt), answer);
  const worker: RunWorker = async ({ task }) => {
    await writeFile(join(task.cwd, task.allowedPaths?.[0] ?? "x"), task.id);
    return { status: "ok" };
  };
  const streamed: number[] = [];
  const onEvent = (event: { readonly seq: number }) => streamed.push(event.seq);
  const result = await planAndRun({ request: "add three math helpers", repoRoot: repo, runTurn, runWorker: worker, verify: verifyOk, shouldInstall: false, onEvent });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.equal(result.kind, "existing");
  assert.deepEqual(result.decision, { mode: "parallel", reason: "disjoint-paths" });
  assert.equal(result.report.status, "ok");
  assert.equal(turns.length, 1);
  assert.match(turns[0] ?? "", /Verification rungs this project supports: .*tests/);
  assert.match(turns[0] ?? "", /<project-context source="Weave project model[^"]*">[\s\S]*Search terms: three, math, helper/);
  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const planned = events.find((event) => event.type === "plan.created");
  assert.equal(planned?.type === "plan.created" && planned.concurrency, 3);
  assert.deepEqual(streamed, events.map((event) => event.seq));
});

test("greenfield: blueprint, committed contract, locked contract, then parallel components", async () => {
  const repo = await repoWith({ "README.md": "# notes app" });
  const blueprint = {
    stack: "TypeScript",
    components: [{ name: "api", responsibility: "HTTP", paths: ["api/**"] }, { name: "frontend", responsibility: "UI", paths: ["web/**"] }],
    schemas: [{ name: "Note", fields: [{ name: "id", type: "string" }] }],
    endpoints: [{ id: "listNotes", method: "GET", path: "/notes", summary: "list", response: "Note" }],
    events: [],
    smokeFlow: ["GET /notes -> 200"],
  };
  const plan = {
    tasks: [
      { id: "API", title: "api", prompt: "serve notes", allowedPaths: ["api/**"], component: "api" },
      { id: "WEB", title: "web", prompt: "list notes", allowedPaths: ["web/**"], component: "frontend" },
    ],
  };
  const runTurn: TurnRunner = async (prompt) => fenced(prompt.includes("Write a lightweight blueprint") ? blueprint : plan);
  const sawContract: boolean[] = [];
  const worker: RunWorker = async ({ task }) => {
    sawContract.push(await exists(join(task.cwd, "packages/contracts")));
    assert.ok(task.readOnlyPaths?.includes("packages/contracts/**"));
    const dir = task.id === "API" ? "api" : "web";
    await mkdir(join(task.cwd, dir), { recursive: true });
    await writeFile(join(task.cwd, dir, "index.ts"), task.id);
    return { status: "ok" };
  };
  const result = await planAndRun({ request: "a notes app", repoRoot: repo, runTurn, runWorker: worker, verify: verifyOk, shouldInstall: false });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.equal(result.kind, "greenfield");
  assert.deepEqual(result.decision, { mode: "parallel", reason: "components-with-contract" });
  assert.deepEqual(sawContract, [true, true]);
  assert.equal(result.report.status, "ok");
  const tree = await runGit(repo, ["ls-tree", "-r", "--name-only", result.report.integration?.branch ?? ""]);
  assert.ok(tree.output.includes("packages/contracts/"));
  assert.ok(tree.output.includes("api/index.ts") && tree.output.includes("web/index.ts"));
  assert.equal((await runGit(repo, ["ls-files", "packages"])).output.trim(), "");
});

test("greenfield: a worker that copies contract symbols fails with the file named, and is not merged", async () => {
  const repo = await repoWith({ "README.md": "# notes app" });
  const blueprint = {
    stack: "Node.js, no dependencies",
    components: [{ name: "api", responsibility: "HTTP", paths: ["api/**"] }, { name: "frontend", responsibility: "UI", paths: ["web/**"] }],
    schemas: [{ name: "Note", fields: [{ name: "id", type: "string" }] }],
    endpoints: [{ id: "listNotes", method: "GET", path: "/notes", summary: "list", response: "Note" }],
    events: [],
    smokeFlow: ["GET /notes -> 200"],
  };
  const plan = {
    tasks: [
      { id: "API", title: "api", prompt: "serve notes", allowedPaths: ["api/**"], component: "api" },
      { id: "WEB", title: "web", prompt: "list notes", allowedPaths: ["web/**"], component: "frontend" },
    ],
  };
  const runTurn: TurnRunner = async (prompt) => fenced(prompt.includes("Write a lightweight blueprint") ? blueprint : plan);
  const worker: RunWorker = async ({ task }) => {
    const dir = task.id === "API" ? "api" : "web";
    await mkdir(join(task.cwd, dir), { recursive: true });
    const content = task.id === "API"
      ? "export const ENDPOINTS = { listNotes: { method: 'GET', path: '/notes' } };\n"
      : "import { ENDPOINTS } from '../packages/contracts/src/index.js';\nconsole.log(ENDPOINTS);\n";
    await writeFile(join(task.cwd, dir, "index.js"), content);
    return { status: "ok" };
  };
  const result = await planAndRun({ request: "a notes app", repoRoot: repo, runTurn, runWorker: worker, verify: verifyOk, shouldInstall: false });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  const byId = new Map(result.report.pool.tasks.map((entry) => [entry.taskId, entry]));
  assert.equal(byId.get("API")?.status, "failed");
  assert.match(byId.get("API")?.reason ?? "", /^re-declares contract symbols locally: api\/index\.js \(ENDPOINTS\)\. Import them from packages\/contracts\/src\/index\.js/);
  assert.equal(byId.get("WEB")?.status, "ok");
  assert.deepEqual(result.report.integration?.merges.map((merge) => merge.taskId), ["WEB"]);
  assert.equal(result.report.status, "failed");
});

test("no-change-needed and invalid plans stop before any worker runs", async () => {
  const repo = await repoWith({ "index.js": "1" });
  const neverRuns: RunWorker = async () => assert.fail("no worker should start");
  const base = { request: "x", repoRoot: repo, runWorker: neverRuns, verify: verifyOk, shouldInstall: false };
  const noop = await planAndRun({ ...base, runTurn: async () => fenced({ noChangeNeeded: "already done" }) });
  assert.deepEqual(noop, { status: "no-change-needed", reason: "already done" });
  const broken = await planAndRun({ ...base, runTurn: async () => "not json" });
  assert.equal(broken.status, "refused");
  assert.match(broken.status === "refused" ? broken.reason : "", /The plan was invalid twice/);
});


test("a plan that is not approved stops after planning: nothing runs and no worker starts", async () => {
  const repo = await repoWith({ "package.json": JSON.stringify({ scripts: { test: "node --test" } }) });
  const answer = fenced({ tasks: [{ id: "T1", title: "add", prompt: "write add", allowedPaths: ["add.js"] }] });
  const workers: string[] = [];
  const worker: RunWorker = async ({ task }) => (workers.push(task.id), { status: "ok" });
  const seen: string[] = [];
  const approvePlan = async () => (seen.push("asked"), false);
  const result = await planAndRun({
    request: "add a helper", repoRoot: repo, runTurn: async () => answer, runWorker: worker, verify: verifyOk, shouldInstall: false,
    onEvent: (event) => seen.push(event.type), approvePlan,
  });
  assert.deepEqual(result, { status: "refused", reason: "The plan was not approved, so nothing ran." });
  assert.deepEqual(workers, []);
  assert.ok(seen.indexOf("plan.created") < seen.indexOf("asked"), seen.join(","));
  assert.equal(await exists(join(repo, "add.js")), false);
});

test("exit: a failed worker wakes the coordinator, which reruns only that task, on another engine", async () => {
  const repo = await repoWith({ "package.json": JSON.stringify({ scripts: { test: "node --test" } }) });
  const plan = {
    tasks: [
      { id: "DB", title: "db", prompt: "write the schema", allowedPaths: ["db.js"], produces: ["schema"], subtasks: ["design it", "write it"] },
      { id: "API", title: "api", prompt: "write the api", allowedPaths: ["api.js"], subtasks: ["route it", "wire it"] },
      { id: "UI", title: "ui", prompt: "write the ui", allowedPaths: ["ui.js"], subtasks: ["render it", "call the api"] },
    ],
  };
  const decision = {
    action: "rerun",
    reason: "the crash reads like an engine problem, so DB moves to codex",
    rerun: [{ id: "DB", engine: "codex", guidance: "the schema you wrote was fine; write it again and commit it" }],
  };
  const prompts: string[] = [];
  const runTurn: TurnRunner = async (prompt) => {
    prompts.push(prompt);
    return fenced(prompt.includes("You are the coordinator of a team that is part-way through a run") ? decision : plan);
  };
  const engines: string[] = [];
  const attempts = new Map<string, number>();
  const worker: RunWorker = async ({ task }) => {
    const attempt = (attempts.get(task.id) ?? 0) + 1;
    attempts.set(task.id, attempt);
    if (task.engine) engines.push(`${task.id}:${task.engine}`);
    if (task.id === "DB" && attempt === 1) return { status: "failed", error: "the engine crashed" };
    await writeFile(join(task.cwd, task.allowedPaths?.[0] ?? "x"), `${task.id}${attempt}`);
    return { status: "ok" };
  };
  const result = await planAndRun({
    request: "build a todo app", repoRoot: repo, config: { engine: "claude-code", fallbackEngines: ["codex"] },
    machineCapacity: 8, runTurn, runWorker: worker, verify: verifyOk, shouldInstall: false,
  });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;

  assert.deepEqual([...attempts.entries()].sort(), [["API", 1], ["DB", 2], ["UI", 1]]);
  assert.deepEqual(engines, ["DB:codex"]);
  assert.deepEqual(result.report.pool.tasks.map((entry) => [entry.taskId, entry.status]).sort(), [["API", "ok"], ["DB", "ok"], ["UI", "ok"]]);
  assert.equal(result.report.status, "ok");

  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const requested = events.find((event) => event.type === "replan.requested");
  assert.deepEqual(requested?.type === "replan.requested" ? requested.triggers.map((trigger) => [trigger.kind, trigger.taskId]) : null, [["worker-failed", "DB"]]);
  const decided = events.find((event) => event.type === "replan.decided");
  assert.deepEqual(decided?.type === "replan.decided" ? decided.rerun : null, [{ id: "DB", engine: "codex" }]);
  assert.equal(events.filter((event) => event.type === "replan.requested").length, 1);
  assert.match(prompts.at(-1) ?? "", /- DB \[failed\] db · produces: schema · outcome: the engine crashed/);
});
