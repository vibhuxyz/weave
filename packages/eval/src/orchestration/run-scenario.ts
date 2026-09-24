import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Ledger, foldRun, logDecision, newRunId, readLedger, runGit, runPlan, sizeUnitsOf, taskKindOf, type OrchestrationDecision, type PlannedTask, type RunPlanResult, type VerifyWorkspace } from "@weave/core";
import { plannedTasks, simWorker, type Scenario, type World } from "./sim/index.ts";
import type { PolicyChoice, ScenarioRun } from "./types.ts";

const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["build"], detail: "simulated verification" });

async function makeRepo(parent: string): Promise<string> {
  const repo = await mkdtemp(join(parent, "repo-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, "README.md"), "simulated project\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=weave", "-c", "user.email=weave@localhost", "commit", "--quiet", "-m", "init"]);
  return repo;
}

function logShape(ledger: Ledger, tasks: readonly PlannedTask[], policy: PolicyChoice): void {
  if (policy.decision) {
    logDecision(ledger, policy.decision);
    return;
  }
  const zero = { timeSaved: 0, coordination: 0, mergeRisk: 0, verification: 0, startup: 0, total: 0 };
  ledger.append("orchestration.decided", {
    workers: policy.workers,
    reason: `${policy.name}: ${policy.reason}`,
    benefitMs: zero,
    estimatedCostMicroUsd: "0",
    tasks: tasks.map((task) => ({ taskId: task.id, kind: taskKindOf(task), sizeUnits: sizeUnitsOf(task.prompt), engines: [...policy.engineOrderFor(task.id)], estimatedMs: 0 })),
  });
}

function priorityFrom(decision: OrchestrationDecision): (taskId: string) => number {
  const priorities = new Map(decision.tasks.map((plan) => [plan.taskId, plan.priorityMs]));
  return (taskId) => priorities.get(taskId) ?? 0;
}

const MAX_FAILURE_CHARS = 200;

function failureOf(result: RunPlanResult): string {
  if (!result.ok) return result.reason.slice(0, MAX_FAILURE_CHARS);
  const task = result.value.pool.tasks.find((entry) => entry.status !== "ok");
  const detail = task ? `${task.taskId} ${task.status}: ${task.reason ?? "no reason"}` : `integration ${result.value.integration?.status ?? "not run"}: ${result.value.integration?.detail ?? ""}`;
  return detail.replace(/\s+/g, " ").slice(0, MAX_FAILURE_CHARS);
}

export interface RunScenarioInput {
  readonly scenario: Scenario;
  readonly world: World;
  readonly policy: PolicyChoice;
  readonly weaveDir: string;
  readonly scratchDir: string;
}

export async function runScenario(input: RunScenarioInput): Promise<ScenarioRun> {
  const { scenario, world, policy, weaveDir } = input;
  const repo = await makeRepo(input.scratchDir);
  try {
    const tasks = plannedTasks(scenario.tasks);
    const ledger = new Ledger(weaveDir, `${newRunId()}-${scenario.id}-${policy.name}`);
    logShape(ledger, tasks, policy);
    const started = performance.now();
    const result = await runPlan({
      tasks, repoRoot: repo, concurrency: policy.workers, ledger, config: { weaveDir }, shouldInstall: false, verify: verifyOk,
      runWorker: simWorker({ world, tasks: scenario.tasks, engineOrderFor: policy.engineOrderFor }),
      ...(policy.decision ? { priorityOf: priorityFrom(policy.decision) } : {}),
    });
    const wallMs = performance.now() - started;
    const attempts = foldRun(await readLedger(weaveDir, ledger.runId)).attempts;
    const costMicroUsd = attempts.reduce((total, attempt) => total + attempt.costMicroUsd, 0n);
    const isOk = result.ok && result.value.status === "ok";
    const failure = isOk ? null : failureOf(result);
    return { scenarioId: scenario.id, shape: scenario.shape, policy: policy.name, workers: policy.workers, isOk, failure, wallMs, costMicroUsd };
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}
