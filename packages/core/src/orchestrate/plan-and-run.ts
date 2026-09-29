import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import type { PlannedTaskFact, VerificationRung } from "@weave/protocol";
import { concurrencyFor, decide, type Decision, type WorkerCount } from "../decide/index.ts";
import { availableRungs, intake } from "../intake/index.ts";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";
import { engineWorker, enginesFor, runPlan, type Reviser, type RunPlanResult } from "../run-plan/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { weaveDirFor } from "../runner/index.ts";
import { choosePlanningEngines, readHistory, type EngineCandidate } from "../adaptive/index.ts";
import type { EmployeeRegistry, PreparedEmployees } from "../employees/index.ts";
import { Ledger, newRunId, once } from "../shared/index.ts";
import { buildProjectModel, queryProject, renderProjectContext, type ProjectModel } from "../context/index.ts";
import { buildExecutionPlan, executionPlanEvent } from "../execution-plan/index.ts";
import { checkCleanBase, describeUntrackedFiles } from "../worktree/index.ts";
import { adaptiveSetup, engineCandidates, type AdaptiveSetup } from "./adaptive-setup.ts";
import { employeeRoutes, employeeSetup, loadRoster, rememberRun, withEmployeeVerification } from "./employee-setup.ts";
import { contractReviser } from "./contract-revision.ts";
import { contractDriftInspector } from "./drift-inspector.ts";
import { openCoordinatorTurn, withPlannerWorkspace } from "./planner-turn.ts";
import { fastPlan, planTasks } from "./planning.ts";
import { coordinatorReviser } from "../replan/index.ts";
import { chosenEngineRoutes, countWorkers } from "./team/index.ts";
import { detectProjectKind } from "./project-kind.ts";
import type { PlanAndRunOptions, PlanAndRunResult, PlanningOutcome, TurnRunner } from "./types.ts";

const DEFAULT_MAX_WORKERS = 4;
const PLAN_NOT_APPROVED = "The plan was not approved, so nothing ran.";
const RUN_STOPPED = "The run was stopped.";

function startsAfter(task: PlannedTask): string[] {
  return (task.dependencies ?? []).filter((dependency) => dependency.requiredOutputs.length === 0).map((dependency) => dependency.task);
}

function taskFact(task: PlannedTask, employeeId: string | undefined, engineId: string | undefined): PlannedTaskFact {
  return {
    id: task.id,
    title: task.title,
    allowedPaths: [...(task.allowedPaths ?? [])],
    dependsOn: (task.dependencies ?? []).map((dependency) => dependency.task),
    ...(startsAfter(task).length > 0 ? { startsAfter: startsAfter(task) } : {}),
    ...(task.readOnlyPaths?.length ? { readOnlyPaths: [...task.readOnlyPaths] } : {}),
    ...(task.produces ? { produces: [...task.produces] } : {}),
    ...(task.subtasks ? { subtasks: [...task.subtasks] } : {}),
    ...(task.skills ? { skills: [...task.skills] } : {}),
    ...(task.complexity ? { complexity: task.complexity } : {}),
    ...(employeeId ? { employee: employeeId } : {}),
    ...(engineId ? { engine: engineId } : {}),
    ...(task.verifyRung ? { verifyRung: task.verifyRung } : {}),
  };
}

function logPlan(ledger: Ledger, kind: ProjectKind, staffing: Staffing, planned: Planned, defaultEngines: readonly string[]): void {
  ledger.append("plan.created", {
    kind,
    mode: staffing.decision.mode,
    reason: staffing.decision.reason,
    concurrency: staffing.count.workers,
    goal: planned.intent.goal,
    assumptions: [...planned.intent.assumptions],
    risks: [...planned.intent.risks],
    tasks: staffing.tasks.map((task) => taskFact(
      task,
      staffing.employees?.employeesByTask.get(task.id)?.id,
      (staffing.routes?.get(task.id) ?? defaultEngines)[0],
    )),
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
  readonly preflightWarnings: readonly string[];
}

interface PlanSources {
  readonly model: ProjectModel | null;
  readonly roster: string | null;
  readonly employeeIds: readonly string[] | null;
  readonly engineCandidates: readonly EngineCandidate[];
}

async function plan(options: PlanAndRunOptions, context: PlanContext, sources: PlanSources): Promise<PlanningOutcome> {
  const engines = choosePlanningEngines(sources.engineCandidates);
  const fast = fastPlan({ request: options.request, kind: context.kind, model: sources.model, repoRoot: context.repoRoot, ledger: context.ledger, engines, preflightWarnings: context.preflightWarnings });
  if (fast) return fast;
  const projectContext = sources.model ? renderProjectContext(queryProject(sources.model, options.request)) : null;
  const withTurn = (runTurn: TurnRunner, reviewTurn: TurnRunner | undefined) =>
    planTasks({ ...context, request: options.request, projectContext, employeeRoster: sources.roster, employeeIds: sources.employeeIds, engineCandidates: sources.engineCandidates, runTurn, reviewTurn, signal: options.signal });
  if (options.runTurn) return withTurn(options.runTurn, options.reviewTurn);
  return withPlannerWorkspace({
    ...context,
    engineId: engines.plannerId,
    reviewerEngineId: engines.reviewerId,
    engineIds: enginesFor(options.config),
    ...(options.config ? { config: options.config } : {}),
  }, withTurn);
}

type Planned = Extract<PlanningOutcome, { status: "planned" }>;

interface Staffing {
  readonly tasks: readonly PlannedTask[];
  readonly decision: Decision;
  readonly count: WorkerCount;
  readonly adaptive: AdaptiveSetup | null;
  readonly employees: PreparedEmployees<PlannedTask> | null;
  readonly routes: ReadonlyMap<string, readonly string[]> | undefined;
}

interface StaffContext extends PlanContext {
  readonly registry: EmployeeRegistry | null;
  readonly engineCandidates: readonly EngineCandidate[];
}

async function staff(options: PlanAndRunOptions, context: StaffContext, planned: Planned): Promise<Staffing> {
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
  const requested = adaptive?.concurrency ?? concurrencyFor(decision, tasks.length, maxWorkers);
  const count = countWorkers({
    ledger,
    requested,
    maxWorkers,
    machineCapacity: options.machineCapacity ?? availableParallelism(),
    affordable: adaptive?.affordable ?? null,
  });
  const routeOf = (taskId: string): readonly string[] => adaptive?.routes.get(taskId) ?? configuredEngines;
  const employeeOrder = employees ? employeeRoutes(employees, routeOf) : adaptive?.routes;
  const routes = chosenEngineRoutes({ tasks, routes: employeeOrder, defaults: configuredEngines, candidates: context.engineCandidates, ledger });
  return { tasks, decision, count, adaptive, employees, routes };
}

function logExecutionPlan(ledger: Ledger, staffing: Staffing, defaultEngines: readonly string[]): void {
  const orchestration = staffing.adaptive?.orchestration ?? null;
  const employees = [...(staffing.employees?.employeesByTask ?? new Map())];
  const plan = buildExecutionPlan({
    tasks: staffing.tasks,
    workers: staffing.count.workers,
    employeesByTask: new Map(employees.map(([taskId, employee]) => [taskId, employee.id])),
    enginesByTask: staffing.routes ?? new Map(),
    defaultEngines,
    estimatedMsByTask: orchestration ? new Map(orchestration.tasks.map((task) => [task.taskId, task.estimatedMs])) : null,
    estimatedCostMicroUsd: orchestration && orchestration.estimatedCostMicroUsd > 0n ? orchestration.estimatedCostMicroUsd : null,
  });
  ledger.append("plan.execution", executionPlanEvent(plan));
}

interface ExecuteContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly model: ProjectModel | null;
  readonly planned: Planned;
  readonly staffing: Staffing;
  readonly engineCandidates: readonly EngineCandidate[];
}

function reviserFor(options: PlanAndRunOptions, context: ExecuteContext, runWorker: RunWorker): Reviser {
  const { repoRoot, weaveDir, ledger, planned, staffing } = context;
  const contract = planned.contract;
  const next = contract ? contractReviser({ tasks: staffing.tasks, contract, repoRoot, weaveDir, ledger, runWorker }) : undefined;
  const turn = options.runTurn;
  return coordinatorReviser({
    tasks: staffing.tasks,
    engineCandidates: context.engineCandidates,
    goal: planned.intent.goal,
    ledger,
    openTurn: async () => turn
      ? { runTurn: turn, close: async () => undefined }
      : openCoordinatorTurn({
          repoRoot,
          weaveDir,
          ledger,
          engineId: choosePlanningEngines(context.engineCandidates).plannerId,
          engineIds: enginesFor(options.config),
          ...(options.config ? { config: options.config } : {}),
        }),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(next ? { next } : {}),
  });
}

function execute(options: PlanAndRunOptions, context: ExecuteContext): Promise<RunPlanResult> {
  const { repoRoot, weaveDir, ledger, planned, staffing } = context;
  const { adaptive, employees, tasks } = staffing;
  const runWorker = options.runWorker ?? engineWorker(options.config, options.policy, { weaveDir, model: context.model, routes: staffing.routes, briefings: employees?.briefings });
  const drift = planned.contract ? contractDriftInspector(planned.contract, ledger) : undefined;
  return runPlan({
    tasks,
    repoRoot,
    concurrency: staffing.count.workers,
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
    revise: reviserFor(options, context, runWorker),
  });
}

export async function planAndRun(options: PlanAndRunOptions): Promise<PlanAndRunResult> {
  const repoRoot = resolve(options.repoRoot);
  const clean = await checkCleanBase(repoRoot);
  if (!clean.ok) return { status: "refused", reason: clean.reason };
  const weaveDir = weaveDirFor(repoRoot, options.config);
  const ledger = new Ledger(weaveDir, newRunId(), options.onEvent);
  const [kind, detected, untracked] = await Promise.all([options.kind ?? detectProjectKind(repoRoot), intake(repoRoot), describeUntrackedFiles(repoRoot, weaveDir)]);
  const context: PlanContext = { repoRoot, weaveDir, ledger, kind, rungs: availableRungs(detected), preflightWarnings: untracked ? [untracked] : [] };

  const [model, roster] = await Promise.all([
    projectModelFor(repoRoot, weaveDir, kind),
    options.employees ? loadRoster(options.employees, context) : null,
  ]);
  const candidates = engineCandidates(options.config);
  const planned = await plan(options, context, { model, roster: roster?.roster ?? null, employeeIds: roster?.registry.employees.map((employee) => employee.id) ?? null, engineCandidates: candidates });
  if (options.signal?.aborted) return { status: "refused", reason: RUN_STOPPED };
  if (planned.status !== "planned") return planned;

  const staffing = await staff(options, { ...context, registry: roster?.registry ?? null, engineCandidates: candidates }, planned);
  const defaultEngines = enginesFor(options.config);
  logPlan(ledger, kind, staffing, planned, defaultEngines);
  logExecutionPlan(ledger, staffing, defaultEngines);
  if (options.signal?.aborted) return { status: "refused", reason: RUN_STOPPED };
  if (options.approvePlan && !(await options.approvePlan())) return { status: "refused", reason: PLAN_NOT_APPROVED };
  const ran = await execute(options, { repoRoot, weaveDir, ledger, model, planned, staffing, engineCandidates: candidates });
  if (!ran.ok) return { status: "refused", reason: ran.reason };
  if (staffing.employees) await rememberRun(staffing.employees, ran.value.pool, context);
  return {
    status: "ran", kind, decision: staffing.decision, tasks: staffing.tasks, report: ran.value,
    orchestration: staffing.adaptive?.orchestration ?? null, assignments: staffing.employees?.assignments ?? [],
  };
}
