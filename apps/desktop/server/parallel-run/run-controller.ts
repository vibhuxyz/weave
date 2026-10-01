import { deliveryPlanOf, type DeliveryPlan, type planAndRun } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import type { ResultDecision, RunOutcome, ServerMessage } from "../shared/index.ts";
import { errorMessage } from "../shared/index.ts";
import { MAX_REQUEST_CHARS } from "./constants.ts";
import { projectRunEvent } from "./project-event.ts";
import { createPendingResult, reviewOf } from "./result-review/index.ts";
import { createApprovalGate, type ApprovalGate } from "./approval-gate.ts";
import { DEFAULT_RUN_DEPENDENCIES, preflight, type RunDependencies } from "./run-preflight.ts";

type PlanAndRun = typeof planAndRun;
type PlanAndRunResult = Awaited<ReturnType<PlanAndRun>>;

export interface StartRunInput {
  readonly request: string;
  readonly projectDir: string;
  readonly engineId: string;
  readonly fallbackEngineIds?: readonly string[];
  readonly runKey: string;
  readonly configOptions?: Readonly<Record<string, string>>;
  readonly routeReason?: string;
  readonly plannerNotes?: string;
  readonly send: (message: ServerMessage) => void;
}

export interface RunController {
  readonly start: (input: StartRunInput) => Promise<void>;
  readonly cancel: () => void;
  readonly decide: (runKey: string, approved: boolean) => void;
  readonly decideResult: (runKey: string, decision: ResultDecision, send: (message: ServerMessage) => void) => Promise<void>;
}

function outcomeOf(result: PlanAndRunResult, plan: DeliveryPlan | null): RunOutcome {
  if (result.status !== "ran") return { status: result.status, reason: result.reason };
  return { status: "ran", result: result.report.status, branch: result.report.integration?.branch ?? null, review: plan ? reviewOf(plan) : null };
}

function engineConfig(input: StartRunInput) {
  const chosen = input.configOptions ?? {};
  return {
    engine: input.engineId,
    fallbackEngines: (input.fallbackEngineIds ?? []).filter((id) => id !== input.engineId),
    ...(Object.keys(chosen).length > 0 ? { configOptions: { ...chosen } } : {}),
  };
}

function requestProblem(request: string): string | null {
  if (request.length === 0) return "Cannot start a parallel run: the request is empty.";
  if (request.length > MAX_REQUEST_CHARS) return `Cannot start a parallel run: the request is over ${MAX_REQUEST_CHARS} characters.`;
  return null;
}

export function createRunController(runPlanAndRun: PlanAndRun, dependencies: RunDependencies = DEFAULT_RUN_DEPENDENCIES): RunController {
  const active: { abort: AbortController | null; runKey: string | null; gate: ApprovalGate | null } = { abort: null, runKey: null, gate: null };
  const pending = createPendingResult();

  const start = async (input: StartRunInput): Promise<void> => {
    const request = input.request.trim();
    const problem = requestProblem(request);
    if (problem) return input.send({ type: "error", message: problem });
    if (active.abort) return input.send({ type: "error", message: "A parallel run is already in progress in this project." });
    const abort = new AbortController();
    active.abort = abort;
    const { runKey, send } = input;
    send({ type: "run-started", runKey, request, ...(input.routeReason ? { routeReason: input.routeReason } : {}) });
    const ready = await preflight({ projectDir: input.projectDir }, dependencies);
    if (!ready.ok) {
      active.abort = null;
      return send({ type: "run-finished", runKey, outcome: ready.outcome });
    }
    if (ready.repoSetup) send({ type: "run-update", runKey, update: { kind: "repo-setup", summary: ready.repoSetup } });
    const gate = createApprovalGate(abort.signal, {
      onWaiting: () => send({ type: "run-update", runKey, update: { kind: "awaiting-approval" } }),
      onApproved: () => send({ type: "run-update", runKey, update: { kind: "plan-approved" } }),
    });
    Object.assign(active, { runKey, gate });
    const onEvent = (event: WeaveEvent) => {
      const update = projectRunEvent(event);
      if (update) send({ type: "run-update", runKey, update });
    };
    try {
      const result = await runPlanAndRun({
        request: input.plannerNotes ? `${request}\n\n${input.plannerNotes}` : request, repoRoot: input.projectDir, config: engineConfig(input), signal: abort.signal, onEvent,
        employees: {}, adaptive: { budgets: ready.budgets }, approvePlan: gate.wait,
      });
      const plan = result.status === "ran" ? deliveryPlanOf(result.report) : null;
      pending.offer(plan ? { runKey, projectDir: input.projectDir, plan } : null);
      send({ type: "run-finished", runKey, outcome: outcomeOf(result, plan) });
    } catch (error: unknown) {
      send({ type: "run-finished", runKey, outcome: { status: "error", reason: `Parallel run failed: ${errorMessage(error)}` } });
    } finally {
      Object.assign(active, { abort: null, runKey: null, gate: null });
    }
  };

  const decide = (runKey: string, approved: boolean): void => {
    if (active.runKey === runKey) active.gate?.decide(approved);
  };

  return { start, cancel: () => active.abort?.abort(), decide, decideResult: pending.decide };
}
