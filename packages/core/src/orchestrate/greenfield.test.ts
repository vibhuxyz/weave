import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlannerPrompt } from "../planner/prompt.ts";
import { Ledger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { prepareGreenfield } from "./greenfield.ts";

const SMALL = JSON.stringify({
  stack: "TypeScript, Express, SQLite",
  components: [{ name: "api", responsibility: "todo API and storage", paths: ["src/**"] }],
  schemas: [{ name: "Todo", fields: [{ name: "id", type: "string" }, { name: "title", type: "string" }] }],
  endpoints: [{ id: "listTodos", method: "GET", path: "/todos", summary: "list todos", request: null, response: "Todo" }],
  events: [],
  smokeFlow: ["GET /todos -> 200"],
});

const SPLIT = JSON.stringify({
  stack: "TypeScript, Express, React",
  components: [
    { name: "api", responsibility: "HTTP API", paths: ["apps/api/**"] },
    { name: "frontend", responsibility: "React UI", paths: ["apps/web/**"] },
  ],
  schemas: [{ name: "Todo", fields: [{ name: "id", type: "string" }] }],
  endpoints: [{ id: "listTodos", method: "GET", path: "/todos", summary: "list todos", request: null, response: "Todo" }],
  events: [],
  smokeFlow: ["GET /todos -> 200"],
});

async function repo(): Promise<{ repoRoot: string; weaveDir: string; ledger: Ledger }> {
  const repoRoot = await mkdtemp(join(tmpdir(), "weave-greenfield-"));
  await runGit(repoRoot, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repoRoot, ".gitignore"), ".weave/\n");
  await runGit(repoRoot, ["add", "-A"]);
  await runGit(repoRoot, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  const weaveDir = join(repoRoot, ".weave");
  return { repoRoot, weaveDir, ledger: new Ledger(weaveDir, "run1") };
}

test("a one-component app gets no contract package and no workspace", async () => {
  const { repoRoot, weaveDir, ledger } = await repo();
  const prepared = await prepareGreenfield({ request: "build a todo app", repoRoot, weaveDir, ledger }, async () => SMALL);

  assert.ok(prepared.ok);
  assert.equal(prepared.value.contract, null, "a single component has no one to agree with");
  assert.equal(prepared.value.contractShape, null);
  assert.equal(existsSync(join(repoRoot, "packages")), false, "nothing may be committed for a single component");
  assert.ok(prepared.value.blueprint.includes("api"));
});

test("two components still get the shared contract they need to agree on", async () => {
  const { repoRoot, weaveDir, ledger } = await repo();
  const prepared = await prepareGreenfield({ request: "build a todo app with a UI", repoRoot, weaveDir, ledger }, async () => SPLIT);

  assert.ok(prepared.ok);
  assert.ok(prepared.value.contract, "parallel workers still need one agreed contract");
  assert.ok(prepared.value.contractShape);
  assert.ok(prepared.value.baseRef);
});

test("one package does not mean one task", () => {
  const prompt = buildPlannerPrompt({ request: "build a full stack todo app", kind: "greenfield", rungs: ["tests"], blueprint: "api, frontend", contract: null });
  assert.match(prompt, /Tasks are not packages: several tasks may work inside one package/);
});

test("without a contract the planner is told to stay in one package", () => {
  const prompt = buildPlannerPrompt({ request: "build a todo app", kind: "greenfield", rungs: ["tests"], blueprint: "api", contract: null });

  assert.match(prompt, /There is no contract and no workspace yet/);
  assert.doesNotMatch(prompt, /workspace root \(package\.json workspaces/);
  assert.doesNotMatch(prompt, /packages\/contracts/);
  assert.match(prompt, /one package at the repository root unless it names separately deployed parts/);
});

test("with a contract the planner still gets the contract rules", () => {
  const prompt = buildPlannerPrompt({ request: "build it", kind: "greenfield", rungs: ["tests"], blueprint: "api, frontend", contract: "Todo" });

  assert.match(prompt, /Tasks read the contract in readOnlyPaths/);
  assert.match(prompt, /workspace root \(package\.json workspaces/);
  assert.doesNotMatch(prompt, /There is no contract and no workspace yet/);
});
