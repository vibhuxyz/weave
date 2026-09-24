import { resolve } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import { concurrencyFor, decide, type Decision } from "../decide/index.ts";
import { availableRungs, intake } from "../intake/index.ts";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";
import { engineWorker, runPlan, type RunPlanResult } from "../run-plan/index.ts";
import { weaveDirFor } from "../runner/index.ts";
import { Ledger, newRunId } from "../shared/index.ts";
import { buildProjectModel, queryProject, renderProjectContext, type ProjectModel } from "../context/index.ts";
import { checkCleanBase } from "../worktree/index.ts";
import { adaptiveSetup, type AdaptiveSetup } from "./adaptive-setup.ts";
import { contractReviser } from "./contract-revision.ts";
import { contractDriftInspector } from "./drift-inspector.ts";
import { withPlannerWorkspace } from "./planner-turn.ts";
import { planTasks } from "./planning.ts";
import { detectProjectKind } from "./project-kind.ts";
import type { PlanAndRunOptions, PlanAndRunResult, PlanningOutcome, TurnRunner } from "./types.ts";

const DEFAULT_MAX_WORKERS = 4;

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

async function projectModelFor(repoRoot: string, weaveDir: string, kind: ProjectKind): Promise<ProjectModel | null> {
  if (kind !== "existing") return null;
  const { model } = await buildProjectModel({ root: repoRoot, weaveDir });
  return model;
}

async function plan(
  options: PlanAndRunOptions,
  context: { readonly repoRoot: string; readonly weaveDir: string; readonly ledger: Ledger; readonly kind: ProjectKind; readonly rungs: readonly VerificationRung[] },
  model: ProjectModel | null,
): Promise<PlanningOutcome> {
  const projectContext = model ? renderProjectContext(queryProject(model, options.request)) : null;
  const withTurn = (runTurn: TurnRunner) => planTasks({ ...context, request: options.request, projectContext, runTurn, signal: options.signal });
  if (options.runTurn) return withTurn(options.runTurn);
  return withPlannerWorkspace({ ...context, engineId: options.config?.engine }, withTurn);
}

interface ExecuteContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly model: ProjectModel | null;
  readonly concurrency: number;
  readonly planned: Extract<PlanningOutcome, { status: "planned" }>;
  readonly adaptive: AdaptiveSetup | null;
}

function execute(options: PlanAndRunOptions, context: ExecuteContext): Promise<RunPlanResult> {
  const { repoRoot, weaveDir, ledger, planned, adaptive } = context;
  const runWorker = options.runWorker ?? engineWorker(options.config, options.policy, { weaveDir, model: context.model, routes: adaptive?.routes });
  const contract = planned.contract;
  return runPlan({
    tasks: planned.tasks,
    repoRoot,
    concurrency: context.concurrency,
    ledger,
    baseRef: planned.baseRef,
    config: options.config,
    policy: options.policy,
    runWorker,
    verify: options.verify,
    signal: options.signal,
    shouldInstall: options.shouldInstall,
    budget: adaptive?.budget,
    priorityOf: adaptive ? (taskId) => adaptive.priorities.get(taskId) ?? 0 : undefined,
    inspectHarvest: contract ? contractDriftInspector(contract, ledger) : undefined,
    revise: contract ? contractReviser({ tasks: planned.tasks, contract, repoRoot, weaveDir, ledger, runWorker }) : undefined,
  });
}

export async function planAndRun(options: PlanAndRunOptions): Promise<PlanAndRunResult> {
  const repoRoot = resolve(options.repoRoot);
  const clean = await checkCleanBase(repoRoot);
  if (!clean.ok) return { status: "refused", reason: clean.reason };
  const weaveDir = weaveDirFor(repoRoot, options.config);
  const ledger = new Ledger(weaveDir, newRunId(), options.onEvent);
  const [kind, detected] = await Promise.all([options.kind ?? detectProjectKind(repoRoot), intake(repoRoot)]);
  const rungs = availableRungs(detected);

  const model = await projectModelFor(repoRoot, weaveDir, kind);
  const planned = await plan(options, { repoRoot, weaveDir, ledger, kind, rungs }, model);
  if (planned.status !== "planned") return planned;

  const baseline = decide({ kind, tasks: planned.tasks, hasContract: planned.contract !== null, rungs });
  const maxWorkers = options.maxWorkers ?? DEFAULT_MAX_WORKERS;
  const adaptive = options.adaptive
    ? await adaptiveSetup({ adaptive: options.adaptive, config: options.config, weaveDir, ledger, tasks: planned.tasks, baseline, maxWorkers })
    : null;
  const decision = adaptive?.decision ?? baseline;
  const concurrency = adaptive?.concurrency ?? concurrencyFor(decision, planned.tasks.length, maxWorkers);
  logPlan(ledger, kind, decision, concurrency, planned.tasks);

  const ran = await execute(options, { repoRoot, weaveDir, ledger, model, concurrency, planned, adaptive });
  if (!ran.ok) return { status: "refused", reason: ran.reason };
  return { status: "ran", kind, decision, tasks: planned.tasks, report: ran.value, orchestration: adaptive?.orchestration ?? null };
}
