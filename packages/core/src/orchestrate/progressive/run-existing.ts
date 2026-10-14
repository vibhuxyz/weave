import type { EngineCandidate } from "../../adaptive/index.ts";
import { buildProjectModel, queryProject, type ProjectModel } from "../../context/index.ts";
import type { EmployeeRegistry } from "../../employees/index.ts";
import type { InspectHarvest, PoolControls, PoolSession } from "../../pool/index.ts";
import type { PlannedTask } from "../../planner/index.ts";
import type { RunPlanResult } from "../../run-plan/index.ts";
import type { Ledger } from "../../shared/index.ts";
import { loadRoster, rememberRun, withEmployeeVerification } from "../employee-setup.ts";
import type { Staffing } from "../plan-and-run.ts";
import type { PlanAndRunOptions, PlanAndRunResult, PlanningOutcome } from "../types.ts";
import { DIRECT_TASK_ID } from "./constants.ts";
import { directTask } from "./direct-task.ts";
import { reconcilePlan } from "./reconcile.ts";
import type { Expansion } from "./types.ts";
import { validateExpansion } from "./validate-expansion.ts";
import { watchProgressive, type ProgressiveSnapshot } from "./watch.ts";

type Planned = Extract<PlanningOutcome, { status: "planned" }>;

interface RunHooks {
  readonly controls: PoolControls;
  readonly attachSession: (session: PoolSession) => void;
  readonly inspectHarvest: InspectHarvest;
  readonly routes: ReadonlyMap<string, readonly string[]>;
  readonly briefings: ReadonlyMap<string, string>;
  readonly modelHolder: { model: ProjectModel | null };
}

export interface ExistingRunInput {
  readonly options: PlanAndRunOptions;
  readonly context: { readonly repoRoot: string; readonly weaveDir: string; readonly ledger: Ledger; readonly kind: "existing" | "greenfield"; readonly preflightWarnings: readonly string[] };
  readonly candidates: readonly EngineCandidate[];
  readonly plan: (sources: { readonly model: ProjectModel | null; readonly roster: string | null; readonly employeeIds: readonly string[] | null; readonly engineCandidates: readonly EngineCandidate[] }, notes?: string) => Promise<PlanningOutcome>;
  readonly staff: (planned: Planned, workers: number, registry: EmployeeRegistry | null) => Promise<Staffing>;
  readonly execute: (planned: Planned, staffing: Staffing, hooks: RunHooks) => Promise<RunPlanResult>;
  readonly log: (staffing: Staffing, planned: Planned) => void;
}

interface Prepared {
  roster: { readonly roster: string; readonly registry: EmployeeRegistry } | null;
}

function gate(): { readonly promise: Promise<PoolSession>; resolve: (session: PoolSession) => void } {
  let resolve: (session: PoolSession) => void = () => undefined;
  const promise = new Promise<PoolSession>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function doneGate(): { readonly promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}

async function snapshotFor(input: ExistingRunInput, holder: { model: ProjectModel | null }, prepared: Prepared): Promise<ProgressiveSnapshot> {
  const { repoRoot, weaveDir } = input.context;
  const [model, roster] = await Promise.all([
    buildProjectModel({ root: repoRoot, weaveDir }).then((built) => built.model),
    input.options.employees ? loadRoster(input.options.employees, input.context) : null,
  ]);
  holder.model = model;
  prepared.roster = roster;
  if (!model) return { workspaces: [], files: [] };
  const answer = queryProject(model, input.options.request);
  const workspaces = [...model.applications, ...model.packages].map((workspace) => ({ name: workspace.name, dir: workspace.dir }));
  return { workspaces, files: answer.files.map((file) => ({ path: file.path, workspace: file.workspace })) };
}

export async function runExisting(input: ExistingRunInput): Promise<PlanAndRunResult> {
  const { options, context } = input;
  const direct = directTask(options.request, context.repoRoot, context.preflightWarnings);
  const liveTasks: PlannedTask[] = [direct];
  const holder = { model: null as ProjectModel | null };
  const prepared: Prepared = { roster: null };
  const routes = new Map<string, readonly string[]>();
  const briefings = new Map<string, string>();
  const inspection: { current: InspectHarvest | undefined } = { current: undefined };
  const controls: PoolControls = { concurrency: 1, waitForOwnership: true };
  const sessionGate = gate();
  const finished = doneGate();
  let session: PoolSession | null = null;
  let staffed: Staffing | null = null;
  const snapshot = snapshotFor(input, holder, prepared);
  const initial: Planned = { status: "planned", tasks: liveTasks, intent: { goal: direct.title, assumptions: [], risks: [] }, contract: null, baseRef: undefined };
  const starting: Staffing = { tasks: liveTasks, decision: { mode: "sequential", reason: "single-task" }, count: { workers: 1, limitedBy: "plan", reason: "one worker starts immediately" }, adaptive: null, employees: null, routes: undefined };
  const watching = watchProgressive({
    request: options.request,
    ledger: context.ledger,
    ...(options.signal ? { signal: options.signal } : {}),
    session: sessionGate.promise,
    done: finished.promise,
    snapshot,
    plan: async (notes) => {
      await snapshot;
      const roster = prepared.roster;
      return input.plan({ model: holder.model, roster: roster?.roster ?? null, employeeIds: roster?.registry.employees.map((employee) => employee.id) ?? null, engineCandidates: input.candidates }, notes);
    },
    expand: (planned, touched) => expand(input, { session, planned, touched, liveTasks, prepared, routes, briefings, inspection, controls, staffed: (value) => { staffed = value; } }),
  });
  const ran = await input.execute(initial, starting, {
    controls,
    modelHolder: holder,
    routes,
    briefings,
    inspectHarvest: (task, path, files) => inspection.current?.(task, path, files) ?? Promise.resolve(null),
    attachSession: (opened) => {
      session = opened;
      sessionGate.resolve(opened);
    },
  }).finally(() => finished.resolve());
  await watching;
  return outcomeOf(input, ran, staffed, starting);
}

async function outcomeOf(input: ExistingRunInput, ran: RunPlanResult, staffed: Staffing | null, starting: Staffing): Promise<PlanAndRunResult> {
  if (!ran.ok) return { status: "refused", reason: ran.reason };
  if (staffed?.employees) await rememberRun(staffed.employees, ran.value.pool, input.context);
  const chosen = staffed ?? starting;
  return {
    status: "ran", kind: input.context.kind, decision: chosen.decision, tasks: chosen.tasks, report: ran.value,
    orchestration: chosen.adaptive?.orchestration ?? null, assignments: chosen.employees?.assignments ?? [],
  };
}

async function expand(input: ExistingRunInput, state: {
  readonly session: PoolSession | null;
  readonly planned: Planned;
  readonly touched: readonly string[];
  readonly liveTasks: PlannedTask[];
  readonly prepared: Prepared;
  readonly routes: Map<string, readonly string[]>;
  readonly briefings: Map<string, string>;
  readonly inspection: { current: InspectHarvest | undefined };
  readonly controls: PoolControls;
  readonly staffed: (value: Staffing) => void;
}): Promise<Expansion> {
  const running = state.liveTasks[0];
  const session = state.session;
  if (!running || !session?.isOpen(DIRECT_TASK_ID)) return held("the first worker is no longer running");
  const reconciled = reconcilePlan(running, state.planned.tasks, state.touched);
  if (!reconciled.ok) return held(reconciled.reason);
  const proposed = validateExpansion([reconciled.direct, ...reconciled.added]);
  if (!proposed.ok) return { ok: false, reasons: proposed.reasons, canRepair: true };
  const staffing = await input.staff({ ...state.planned, tasks: [reconciled.direct, ...reconciled.added] }, reconciled.added.length + 1, state.prepared.roster?.registry ?? null);
  const direct = staffing.tasks.find((task) => task.id === DIRECT_TASK_ID);
  const added = staffing.tasks.filter((task) => task.id !== DIRECT_TASK_ID);
  if (!direct || !session.isOpen(DIRECT_TASK_ID)) return held("the first worker is no longer running");
  const checked = validateExpansion([direct, ...added]);
  if (!checked.ok) return { ok: false, reasons: checked.reasons, canRepair: true };
  if (staffing.adaptive) {
    state.controls.budget = staffing.adaptive.budget;
    state.controls.priorityOf = (taskId) => staffing.adaptive?.priorities.get(taskId) ?? 0;
  }
  state.controls.concurrency = staffing.count.workers;
  for (const [taskId, route] of staffing.routes ?? []) state.routes.set(taskId, route);
  for (const [taskId, briefing] of staffing.employees?.briefings ?? []) state.briefings.set(taskId, briefing);
  if (staffing.employees) state.inspection.current = withEmployeeVerification(staffing.employees, input.context.ledger, state.inspection.current);
  if (!session.retarget(DIRECT_TASK_ID, direct)) return held("the running worker could not take the revised task");
  const admitted = session.admit(added);
  if (!admitted.ok) return held(admitted.reason);
  state.liveTasks.splice(0, state.liveTasks.length, ...staffing.tasks);
  state.staffed(staffing);
  input.log(staffing, { ...state.planned, tasks: staffing.tasks });
  return { ok: true };
}

function held(reason: string): Expansion {
  return { ok: false, reasons: [reason], canRepair: false };
}
