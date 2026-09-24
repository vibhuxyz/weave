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

