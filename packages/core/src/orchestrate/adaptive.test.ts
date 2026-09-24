import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HistoryStats } from "../adaptive/index.ts";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { readLedger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { planAndRun } from "./plan-and-run.ts";
import type { TurnRunner } from "./types.ts";

async function repoWithTests(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-adaptive-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const twoDisjointTasks: TurnRunner = async () => `\`\`\`json\n${JSON.stringify({
  tasks: ["add", "sub"].map((name, index) => ({ id: `T${index + 1}`, title: name, prompt: `write ${name}`, allowedPaths: [`${name}.js`] })),
})}\n\`\`\``;
const worker: RunWorker = async ({ task }) => {
  await writeFile(join(task.cwd, task.allowedPaths?.[0] ?? "x"), task.id);
  return { status: "ok" };
};
const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["tests"], detail: "ok" });
const base = { request: "add two helpers", runTurn: twoDisjointTasks, runWorker: worker, verify: verifyOk, shouldInstall: false } as const;

const learned: HistoryStats = {
  runs: 5, engines: new Map(), startupMs: 1_000, coordinationMsPerWorker: 0, conflictRate: 0, verifyMs: 0,
  projectSpend: { costMicroUsd: 0n, tokens: 0, wallMs: 0 },
};

test("adaptive mode without history keeps the baseline plan and says why", async () => {
  const result = await planAndRun({ ...base, repoRoot: await repoWithTests(), adaptive: {} });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.deepEqual(result.decision, { mode: "sequential", reason: "adaptive" });
  assert.equal(result.orchestration?.workers, 1);
  assert.match(result.orchestration?.reason ?? "", /only 0 run\(s\) of history/);
});

test("adaptive mode with history runs two disjoint tasks in parallel where the fixed rule would not", async () => {
  const repo = await repoWithTests();
  const result = await planAndRun({ ...base, repoRoot: repo, adaptive: { stats: learned } });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.equal(result.report.status, "ok");
  assert.deepEqual(result.decision, { mode: "parallel", reason: "adaptive" });
  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const decided = events.find((event) => event.type === "orchestration.decided");
  assert.equal(decided?.type === "orchestration.decided" && decided.workers, 2);
  const planned = events.find((event) => event.type === "plan.created");
  assert.equal(planned?.type === "plan.created" && planned.concurrency, 2);
});
