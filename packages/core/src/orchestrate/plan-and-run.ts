import { resolve } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import { decide, type Decision } from "../decide/index.ts";
import { availableRungs, intake } from "../intake/index.ts";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";
import { engineWorker, runPlan } from "../run-plan/index.ts";
import { weaveDirFor } from "../runner/index.ts";
import { Ledger, newRunId } from "../shared/index.ts";
import { checkCleanBase } from "../worktree/index.ts";
import { contractReviser } from "./contract-revision.ts";
import { contractDriftInspector } from "./drift-inspector.ts";
import { withPlannerWorkspace } from "./planner-turn.ts";
import { planTasks } from "./planning.ts";
import { detectProjectKind } from "./project-kind.ts";
import type { PlanAndRunOptions, PlanAndRunResult, PlanningOutcome, TurnRunner } from "./types.ts";

const DEFAULT_MAX_WORKERS = 4;

function concurrencyFor(decision: Decision, taskCount: number, maxWorkers: number): number {
  return decision.mode === "parallel" ? Math.max(1, Math.min(taskCount, maxWorkers)) : 1;
}

function logPlan(ledger: Ledger, kind: ProjectKind, decision: Decision, concurrency: number, tasks: readonly PlannedTask[]): void {
  ledger.append("plan.created", {
    kind,
    mode: decision.mode,
    reason: decision.reason,
    concurrency,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      allowedPaths: [...(task.allowedPaths ?? [])],
      dependsOn: (task.dependencies ?? []).map((dependency) => dependency.task),
    })),
  });
}

async function plan(
  options: PlanAndRunOptions,
  context: { readonly repoRoot: string; readonly weaveDir: string; readonly ledger: Ledger; readonly kind: ProjectKind; readonly rungs: readonly VerificationRung[] },
): Promise<PlanningOutcome> {
  const withTurn = (runTurn: TurnRunner) => planTasks({ ...context, request: options.request, runTurn, signal: options.signal });
  if (options.runTurn) return withTurn(options.runTurn);
  return withPlannerWorkspace({ ...context, engineId: options.config?.engine }, withTurn);
}

export async function planAndRun(options: PlanAndRunOptions): Promise<PlanAndRunResult> {
  const repoRoot = resolve(options.repoRoot);
  const clean = await checkCleanBase(repoRoot);
  if (!clean.ok) return { status: "refused", reason: clean.reason };
  const weaveDir = weaveDirFor(repoRoot, options.config);
  const ledger = new Ledger(weaveDir, newRunId());
  const [kind, detected] = await Promise.all([options.kind ?? detectProjectKind(repoRoot), intake(repoRoot)]);
  const rungs = availableRungs(detected);

  const planned = await plan(options, { repoRoot, weaveDir, ledger, kind, rungs });
  if (planned.status !== "planned") return planned;

  const decision = decide({ kind, tasks: planned.tasks, hasContract: planned.contract !== null, rungs });
  const concurrency = concurrencyFor(decision, planned.tasks.length, options.maxWorkers ?? DEFAULT_MAX_WORKERS);
  logPlan(ledger, kind, decision, concurrency, planned.tasks);

  const runWorker = options.runWorker ?? engineWorker(options.config, options.policy);
  const contract = planned.contract;
  const ran = await runPlan({
    tasks: planned.tasks,
    repoRoot,
    concurrency,
    ledger,
    baseRef: planned.baseRef,
    config: options.config,
    policy: options.policy,
    runWorker,
    verify: options.verify,
    signal: options.signal,
    shouldInstall: options.shouldInstall,
    inspectHarvest: contract ? contractDriftInspector(contract, ledger) : undefined,
    revise: contract ? contractReviser({ tasks: planned.tasks, contract, repoRoot, weaveDir, ledger, runWorker }) : undefined,
  });
  if (!ran.ok) return { status: "refused", reason: ran.reason };
  return { status: "ran", kind, decision, tasks: planned.tasks, report: ran.value };
}
