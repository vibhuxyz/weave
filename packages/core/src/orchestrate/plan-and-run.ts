import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import type { PlannedTaskFact, VerificationRung } from "@weave/protocol";
import { concurrencyFor, decide, withOverlapEdges, type Decision, type WorkerCount } from "../decide/index.ts";
import { availableRungs, intake } from "../intake/index.ts";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";
import { engineWorker, enginesFor, firstRevision, runPlan, type Reviser, type RunPlanResult } from "../run-plan/index.ts";
import type { InspectHarvest, PoolControls, PoolSession, RunWorker } from "../pool/index.ts";
import { weaveDirFor } from "../runner/index.ts";
import { choosePlanningEngines, readHistory, type EngineCandidate } from "../adaptive/index.ts";
import type { EmployeeRegistry, PreparedEmployees } from "../employees/index.ts";
import { Ledger, newRunId, once } from "../shared/index.ts";
import { buildProjectModel, type ProjectModel } from "../context/index.ts";
import { buildExecutionPlan, executionPlanEvent } from "../execution-plan/index.ts";
import { describeUntrackedFiles, resolveRunBase, type RunBase } from "../worktree/index.ts";
import { adaptiveSetup, engineCandidates, type AdaptiveSetup } from "./adaptive-setup.ts";
import { employeeRoutes, employeeSetup, loadRoster, rememberRun, withEmployeeVerification } from "./employee-setup.ts";
import { contractReviser } from "./contract-revision.ts";
import { contractDriftInspector } from "./drift-inspector.ts";
import { openCoordinatorTurn, withPlannerWorkspace } from "./planner-turn.ts";
import { fastPlan, planTasks } from "./planning.ts";
import { coordinatorReviser } from "../replan/index.ts";
import { chosenEngineRoutes, countWorkers } from "./team/index.ts";
import { detectProjectKind } from "./project-kind.ts";
import { runExisting } from "./progressive/index.ts";
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

function presetPlan(tasks: readonly PlannedTask[]): PlanningOutcome {
  return { status: "planned", tasks, intent: { goal: null, assumptions: [], risks: [] }, contract: null, baseRef: undefined };
}

async function plan(options: PlanAndRunOptions, context: PlanContext, sources: PlanSources, notes?: string): Promise<PlanningOutcome> {
  if (options.presetTasks?.length) return presetPlan(options.presetTasks);
  const engines = choosePlanningEngines(sources.engineCandidates);
  const fast = options.images?.length ? null : fastPlan({ request: options.request, kind: context.kind, model: sources.model, repoRoot: context.repoRoot, ledger: context.ledger, engines, preflightWarnings: context.preflightWarnings });
  if (fast) return fast;
  const withTurn = (runTurn: TurnRunner, reviewTurn: TurnRunner | undefined) =>
    planTasks({ ...context, request: options.request, model: sources.model, planningBudgetMs: options.planningBudgetMs, employeeRoster: sources.roster, employeeIds: sources.employeeIds, engineCandidates: sources.engineCandidates, runTurn, reviewTurn, signal: options.signal, notes });
  if (options.runTurn) return withTurn(options.runTurn, options.reviewTurn);
  return withPlannerWorkspace({
    ...context,
    engineId: engines.plannerId,
    reviewerEngineId: engines.reviewerId,
    engineIds: enginesFor(options.config),
    ...(options.config ? { config: options.config } : {}),
    ...(options.images?.length ? { images: options.images } : {}),
  }, withTurn);
}

type Planned = Extract<PlanningOutcome, { status: "planned" }>;

export interface Staffing {
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

async function staff(options: PlanAndRunOptions, context: StaffContext, planned: Planned, requestedWorkers?: number): Promise<Staffing> {
  const { weaveDir, ledger, kind, rungs } = context;
  const history = once(() => readHistory(weaveDir, { excludeRunIds: [ledger.runId] }));
  const configuredEngines = enginesFor(options.config);
  const employees = context.registry
    ? await employeeSetup({ ...context, registry: context.registry, tasks: planned.tasks, configuredEngines, history })
    : null;
  const tasks = withOverlapEdges(employees?.tasks ?? planned.tasks);
  const baseline = decide({ kind, tasks, hasContract: planned.contract !== null, rungs });
  const maxWorkers = options.maxWorkers ?? DEFAULT_MAX_WORKERS;
  const adaptive = options.adaptive
    ? await adaptiveSetup({ adaptive: options.adaptive, config: options.config, weaveDir, ledger, tasks, baseline, maxWorkers, history })
    : null;
  const expanded = requestedWorkers !== undefined && requestedWorkers > 1;
  const decision = adaptive?.decision ?? (expanded ? { mode: "parallel" as const, reason: "disjoint-paths" as const } : baseline);
  const requested = adaptive?.concurrency ?? (expanded ? requestedWorkers : concurrencyFor(decision, tasks.length, maxWorkers));
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
  readonly base: RunBase;
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
          ...(options.images?.length ? { images: options.images } : {}),
        }),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(next ? { next } : {}),
  });
}

interface ExecuteHooks {
  readonly controls?: PoolControls;
  readonly attachSession?: (session: PoolSession) => void;
  readonly inspectHarvest?: InspectHarvest;
  readonly routes?: ReadonlyMap<string, readonly string[]>;
  readonly briefings?: ReadonlyMap<string, string>;
  readonly modelHolder?: { model: ProjectModel | null };
  readonly followUp?: Reviser;
}

function mergedBriefings(options: PlanAndRunOptions, chosen: ReadonlyMap<string, string> | undefined): ReadonlyMap<string, string> | undefined {
  if (!options.briefings) return chosen;
  return new Map([...options.briefings, ...(chosen ?? [])]);
}

function execute(options: PlanAndRunOptions, context: ExecuteContext, hooks?: ExecuteHooks): Promise<RunPlanResult> {
  const { repoRoot, weaveDir, ledger, planned, staffing } = context;
  const { adaptive, employees, tasks } = staffing;
  const modelHolder = hooks?.modelHolder ?? { model: context.model };
  const runWorker = options.runWorker ?? engineWorker(options.config, options.policy, {
    weaveDir,
    get model() { return modelHolder.model; },
    routes: hooks?.routes ?? staffing.routes,
    briefings: mergedBriefings(options, hooks?.briefings ?? employees?.briefings),
    ...(options.images?.length ? { images: options.images } : {}),
  });
  const drift = planned.contract ? contractDriftInspector(planned.contract, ledger) : undefined;
  const inspection = employees ? withEmployeeVerification(employees, ledger, drift) : drift;
  return runPlan({
    tasks,
    repoRoot,
    concurrency: hooks?.controls?.concurrency ?? staffing.count.workers,
    ledger,
    baseRef: planned.baseRef ?? context.base.commit,
    snapshot: planned.baseRef === undefined ? context.base.snapshot ?? undefined : undefined,
    config: options.config,
    policy: options.policy,
    runWorker,
    verify: options.verify,
    signal: options.signal,
    shouldInstall: options.shouldInstall,
    budget: hooks?.controls ? undefined : adaptive?.budget,
    priorityOf: hooks?.controls ? undefined : (adaptive ? (taskId) => adaptive.priorities.get(taskId) ?? 0 : undefined),
    inspectHarvest: hooks?.inspectHarvest ?? inspection,
    controls: hooks?.controls,
    attachSession: (session) => {
      hooks?.attachSession?.(session);
      options.onPoolSession?.(session);
    },
    revise: firstRevision(hooks?.followUp, reviserFor(options, context, runWorker)),
  });
}

export async function planAndRun(options: PlanAndRunOptions): Promise<PlanAndRunResult> {
  const repoRoot = resolve(options.repoRoot);
  const base = await resolveRunBase(repoRoot);
  if (!base.ok) return { status: "refused", reason: base.reason };
  const weaveDir = weaveDirFor(repoRoot, options.config);
  const ledger = new Ledger(weaveDir, newRunId(), options.onEvent);
  const [kind, detected, untracked] = await Promise.all([options.kind ?? detectProjectKind(repoRoot), intake(repoRoot), describeUntrackedFiles(repoRoot, weaveDir)]);
  const snapshotNote = base.value.snapshot ? `Workers started from a snapshot of ${base.value.snapshot.fileCount} uncommitted file(s), so they can see your unsaved work.` : null;
  const warning = snapshotNote ?? untracked;
  const context: PlanContext = { repoRoot, weaveDir, ledger, kind, rungs: availableRungs(detected), preflightWarnings: warning ? [warning] : [] };

  const candidates = engineCandidates(options.config);
  if (kind !== "greenfield") {
    return runExisting({
      options,
      context,
      candidates,
      plan: (sources, notes) => plan(options, context, sources, notes),
      staff: (planned, workers, registry) => staff(options, { ...context, registry, engineCandidates: candidates }, planned, workers),
      execute: (planned, staffing, hooks) => execute(options, { repoRoot, weaveDir, ledger, model: hooks.modelHolder.model, planned, staffing, base: base.value, engineCandidates: candidates }, hooks),
      log: (staffing, planned) => {
        const engines = enginesFor(options.config);
        logPlan(ledger, kind, staffing, planned, engines);
        logExecutionPlan(ledger, staffing, engines);
      },
    });
  }
  const [model, roster] = await Promise.all([
    projectModelFor(repoRoot, weaveDir, kind),
    options.employees ? loadRoster(options.employees, context) : null,
  ]);
  const planned = await plan(options, context, { model, roster: roster?.roster ?? null, employeeIds: roster?.registry.employees.map((employee) => employee.id) ?? null, engineCandidates: candidates });
  if (options.signal?.aborted) return { status: "refused", reason: RUN_STOPPED };
  if (planned.status !== "planned") return planned;

  const staffing = await staff(options, { ...context, registry: roster?.registry ?? null, engineCandidates: candidates }, planned);
  const defaultEngines = enginesFor(options.config);
  logPlan(ledger, kind, staffing, planned, defaultEngines);
  logExecutionPlan(ledger, staffing, defaultEngines);
  if (options.signal?.aborted) return { status: "refused", reason: RUN_STOPPED };
  if (options.approvePlan && !(await options.approvePlan())) return { status: "refused", reason: PLAN_NOT_APPROVED };
  const ran = await execute(options, { repoRoot, weaveDir, ledger, model, planned, staffing, base: base.value, engineCandidates: candidates });
  if (!ran.ok) return { status: "refused", reason: ran.reason };
  if (staffing.employees) await rememberRun(staffing.employees, ran.value.pool, context);
  return {
    status: "ran", kind, decision: staffing.decision, tasks: staffing.tasks, report: ran.value,
    orchestration: staffing.adaptive?.orchestration ?? null, assignments: staffing.employees?.assignments ?? [],
  };
}
