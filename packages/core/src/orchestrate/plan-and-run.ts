import { resolve } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import { concurrencyFor, decide, type Decision } from "../decide/index.ts";
import { availableRungs, intake } from "../intake/index.ts";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";
import { engineWorker, enginesFor, runPlan, type RunPlanResult } from "../run-plan/index.ts";
import { weaveDirFor } from "../runner/index.ts";
import { readHistory } from "../adaptive/index.ts";
import type { EmployeeRegistry, PreparedEmployees } from "../employees/index.ts";
import { Ledger, newRunId, once } from "../shared/index.ts";
import { buildProjectModel, queryProject, renderProjectContext, type ProjectModel } from "../context/index.ts";
import { checkCleanBase } from "../worktree/index.ts";
import { adaptiveSetup, type AdaptiveSetup } from "./adaptive-setup.ts";
import { employeeRoutes, employeeSetup, loadRoster, rememberRun, withEmployeeVerification } from "./employee-setup.ts";
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

interface PlanContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly kind: ProjectKind;
  readonly rungs: readonly VerificationRung[];
}

async function plan(options: PlanAndRunOptions, context: PlanContext, sources: { readonly model: ProjectModel | null; readonly roster: string | null }): Promise<PlanningOutcome> {
  const projectContext = sources.model ? renderProjectContext(queryProject(sources.model, options.request)) : null;
  const withTurn = (runTurn: TurnRunner) => planTasks({ ...context, request: options.request, projectContext, employeeRoster: sources.roster, runTurn, signal: options.signal });
  if (options.runTurn) return withTurn(options.runTurn);
  return withPlannerWorkspace({ ...context, engineId: options.config?.engine }, withTurn);
}

type Planned = Extract<PlanningOutcome, { status: "planned" }>;

interface Staffing {
  readonly tasks: readonly PlannedTask[];
  readonly decision: Decision;
  readonly concurrency: number;
  readonly adaptive: AdaptiveSetup | null;
  readonly employees: PreparedEmployees<PlannedTask> | null;
  readonly routes: ReadonlyMap<string, readonly string[]> | undefined;
}

async function staff(options: PlanAndRunOptions, context: PlanContext & { readonly registry: EmployeeRegistry | null }, planned: Planned): Promise<Staffing> {
  const { weaveDir, ledger, kind, rungs } = context;
  const history = once(() => readHistory(weaveDir, { excludeRunIds: [ledger.runId] }));
  const configuredEngines = enginesFor(options.config);
  const employees = context.registry
    ? await employeeSetup({ ...context, registry: context.registry, tasks: planned.tasks, configuredEngines, history })
    : null;
  const tasks = employees?.tasks ?? planned.tasks;
  const baseline = decide({ kind, tasks, hasContract: planned.contract !== null, rungs });
  const maxWorkers = options.maxWorkers ?? DEFAULT_MAX_WORKERS;
  const adaptive = options.adaptive
    ? await adaptiveSetup({ adaptive: options.adaptive, config: options.config, weaveDir, ledger, tasks, baseline, maxWorkers, history })
    : null;
  const decision = adaptive?.decision ?? baseline;
  const concurrency = adaptive?.concurrency ?? concurrencyFor(decision, tasks.length, maxWorkers);
  const routeOf = (taskId: string): readonly string[] => adaptive?.routes.get(taskId) ?? configuredEngines;
  const routes = employees ? employeeRoutes(employees, routeOf) : adaptive?.routes;
  return { tasks, decision, concurrency, adaptive, employees, routes };
}

interface ExecuteContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly model: ProjectModel | null;
  readonly planned: Planned;
  readonly staffing: Staffing;
}

function execute(options: PlanAndRunOptions, context: ExecuteContext): Promise<RunPlanResult> {
  const { repoRoot, weaveDir, ledger, planned, staffing } = context;
  const { adaptive, employees, tasks } = staffing;
  const runWorker = options.runWorker ?? engineWorker(options.config, options.policy, { weaveDir, model: context.model, routes: staffing.routes, briefings: employees?.briefings });
  const contract = planned.contract;
  const drift = contract ? contractDriftInspector(contract, ledger) : undefined;
  return runPlan({
    tasks,
    repoRoot,
    concurrency: staffing.concurrency,
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
    inspectHarvest: employees ? withEmployeeVerification(employees, ledger, drift) : drift,
    revise: contract ? contractReviser({ tasks, contract, repoRoot, weaveDir, ledger, runWorker }) : undefined,
  });
}

export async function planAndRun(options: PlanAndRunOptions): Promise<PlanAndRunResult> {
  const repoRoot = resolve(options.repoRoot);
  const clean = await checkCleanBase(repoRoot);
  if (!clean.ok) return { status: "refused", reason: clean.reason };
  const weaveDir = weaveDirFor(repoRoot, options.config);
  const ledger = new Ledger(weaveDir, newRunId(), options.onEvent);
  const [kind, detected] = await Promise.all([options.kind ?? detectProjectKind(repoRoot), intake(repoRoot)]);
  const context: PlanContext = { repoRoot, weaveDir, ledger, kind, rungs: availableRungs(detected) };

  const [model, roster] = await Promise.all([
    projectModelFor(repoRoot, weaveDir, kind),
    options.employees ? loadRoster(options.employees, context) : null,
  ]);
  const planned = await plan(options, context, { model, roster: roster?.roster ?? null });
  if (planned.status !== "planned") return planned;

  const staffing = await staff(options, { ...context, registry: roster?.registry ?? null }, planned);
  logPlan(ledger, kind, staffing.decision, staffing.concurrency, staffing.tasks);
  const ran = await execute(options, { repoRoot, weaveDir, ledger, model, planned, staffing });
  if (!ran.ok) return { status: "refused", reason: ran.reason };
  if (staffing.employees) await rememberRun(staffing.employees, ran.value.pool, context);
  return {
    status: "ran", kind, decision: staffing.decision, tasks: staffing.tasks, report: ran.value,
    orchestration: staffing.adaptive?.orchestration ?? null, assignments: staffing.employees?.assignments ?? [],
  };
}
