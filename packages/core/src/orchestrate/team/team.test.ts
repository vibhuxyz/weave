import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineCandidate } from "../../adaptive/index.ts";
import { Ledger, newRunId, readLedger } from "../../shared/index.ts";
import { runGit } from "../../worktree/index.ts";
import type { PlannedTask } from "../../planner/index.ts";
import { planAndRun } from "../plan-and-run.ts";
import type { TurnRunner } from "../types.ts";
import { chosenEngineRoutes } from "./chosen-engines.ts";
import { engineIdsOf, renderEngineCatalog } from "./engine-catalog.ts";
import { countWorkers } from "./worker-count.ts";

const CANDIDATES: readonly EngineCandidate[] = [
  { id: "codex", capabilities: { fileEditing: true, toolCalls: true, planning: true } },
  { id: "claude-code", capabilities: { fileEditing: true, toolCalls: true, planning: true, skills: true } },
  { id: "reader", capabilities: { toolCalls: true, fileEditing: false } },
];

function task(id: string, engine?: string): PlannedTask {
  return { id, title: id, prompt: `do ${id}`, cwd: "/repo", allowedPaths: [`${id}/**`], ...(engine === undefined ? {} : { engine }) };
}

async function ledgerIn(): Promise<{ readonly ledger: Ledger; readonly weaveDir: string }> {
  const weaveDir = await mkdtemp(join(tmpdir(), "weave-team-"));
  return { ledger: new Ledger(weaveDir, newRunId()), weaveDir };
}

test("the engine catalog the coordinator sees lists every installed engine and what it declares", () => {
  const catalog = renderEngineCatalog(CANDIDATES) ?? "";
  assert.match(catalog, /- claude-code: fileEditing, planning, skills, toolCalls/);
  assert.match(catalog, /- reader: toolCalls/);
  assert.ok(catalog.indexOf("claude-code") < catalog.indexOf("codex"), "engines are listed in a fixed order");
  assert.deepEqual(engineIdsOf(CANDIDATES), ["codex", "claude-code", "reader"]);
  assert.equal(renderEngineCatalog([]), null);
});

test("a worker's chosen engine goes first, and a refused choice is recorded, not dropped", async () => {
  const { ledger, weaveDir } = await ledgerIn();
  const tasks = [task("T1", "codex"), task("T2"), task("T3", "reader")];
  const routes = chosenEngineRoutes({ tasks, routes: undefined, defaults: ["claude-code", "codex"], candidates: CANDIDATES, ledger });
  assert.deepEqual(routes?.get("T1"), ["codex", "claude-code"]);
  assert.deepEqual(routes?.get("T2"), ["claude-code", "codex"]);
  assert.deepEqual(routes?.get("T3"), ["claude-code", "codex"]);
  const events = await readLedger(weaveDir, ledger.runId);
  const refusals = events.filter((event) => event.type === "error");
  assert.equal(refusals.length, 1);
  assert.match(refusals[0]?.type === "error" ? refusals[0].message : "", /T3: engine reader does not declare fileEditing/);
});

test("with no engine chosen anywhere, the routed chains are left exactly as they were", async () => {
  const { ledger } = await ledgerIn();
  const routed = new Map([["T1", ["codex"]]]);
  assert.equal(chosenEngineRoutes({ tasks: [task("T1")], routes: routed, defaults: ["claude-code"], candidates: CANDIDATES, ledger }), routed);
});

test("the worker count is recorded with every constraint that produced it", async () => {
  const { ledger, weaveDir } = await ledgerIn();
  const count = countWorkers({ ledger, requested: 5, maxWorkers: 4, machineCapacity: 2, affordable: null });
  assert.equal(count.workers, 2);
  const events = await readLedger(weaveDir, ledger.runId);
  const workers = events.find((event) => event.type === "plan.workers");
  assert.equal(workers?.type === "plan.workers" && workers.limitedBy, "machine");
  assert.deepEqual(
    workers?.type === "plan.workers" ? { requested: workers.requested, maxWorkers: workers.maxWorkers, machineCapacity: workers.machineCapacity, affordable: workers.affordable } : null,
    { requested: 5, maxWorkers: 4, machineCapacity: 2, affordable: null },
  );
});

test("a coordinator plan that names an engine per worker runs those workers on those engines", async () => {
  const repo = await mkdtemp(join(tmpdir(), "weave-team-repo-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);

  const plan = {
    tasks: [
      { id: "API", title: "api", prompt: "serve todos", allowedPaths: ["api.js"], engine: "codex" },
      { id: "WEB", title: "web", prompt: "list todos", allowedPaths: ["web.js"], engine: "not-installed" },
      { id: "DB", title: "db", prompt: "store todos", allowedPaths: ["db.js"] },
    ],
  };
  const prompts: string[] = [];
  const runTurn: TurnRunner = async (prompt) => {
    prompts.push(prompt);
    return "```json\n" + JSON.stringify(plan) + "\n```";
  };
  const result = await planAndRun({
    request: "build a todo app in three parts",
    repoRoot: repo,
    config: { engine: "claude-code", fallbackEngines: ["codex"] },
    machineCapacity: 8,
    runTurn,
    runWorker: async ({ task: assigned }) => {
      await writeFile(join(assigned.cwd, assigned.allowedPaths?.[0] ?? "x"), assigned.id);
      return { status: "ok" };
    },
    verify: async () => ({ ok: true, rungs: ["tests"], detail: "ok" }),
    shouldInstall: false,
  });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.match(prompts[0] ?? "", /<engine-catalog>/);
  assert.match(prompts[0] ?? "", /- claude-code: /);

  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const execution = events.find((event) => event.type === "plan.execution");
  const engineOf = new Map(execution?.type === "plan.execution" ? execution.slots.map((slot) => [slot.taskId, slot.engineId]) : []);
  assert.equal(engineOf.get("API"), "codex");
  assert.equal(engineOf.get("WEB"), "claude-code");
  assert.equal(engineOf.get("DB"), "claude-code");

  const created = events.find((event) => event.type === "plan.created");
  const planned = created?.type === "plan.created" ? created.tasks.find((entry) => entry.id === "API") : undefined;
  assert.equal(planned?.engine, "codex");
  const refusal = events.find((event) => event.type === "error" && event.where === "engine.choice");
  assert.match(refusal?.type === "error" ? refusal.message : "", /engine not-installed is not installed for this run/);
});
