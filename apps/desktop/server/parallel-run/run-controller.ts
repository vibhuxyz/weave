import { join } from "node:path";
import type { planAndRun } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import type { RunOutcome, ServerMessage } from "../shared/index.ts";
import { errorMessage } from "../shared/index.ts";
import { MAX_REQUEST_CHARS } from "./constants.ts";
import { projectRunEvent } from "./project-event.ts";
import { parseRunOptions } from "./run-options.ts";

const USER_EMPLOYEES_DIR = "employees";

type PlanAndRun = typeof planAndRun;
type PlanAndRunResult = Awaited<ReturnType<PlanAndRun>>;

export interface StartRunInput {
  readonly request: string;
  readonly projectDir: string;
  readonly engineId: string;
  readonly fallbackEngineIds?: readonly string[];
  readonly runKey: string;
  readonly options?: unknown;
  readonly weaveHome: string;
  readonly send: (message: ServerMessage) => void;
}

export interface RunController {
  readonly start: (input: StartRunInput) => Promise<void>;
  readonly cancel: () => void;
}

function outcomeOf(result: PlanAndRunResult): RunOutcome {
  if (result.status !== "ran") return { status: result.status, reason: result.reason };
  return { status: "ran", result: result.report.status, branch: result.report.integration?.branch ?? null };
}

function requestProblem(request: string): string | null {
  if (request.length === 0) return "Cannot start a parallel run: the request is empty.";
  if (request.length > MAX_REQUEST_CHARS) return `Cannot start a parallel run: the request is over ${MAX_REQUEST_CHARS} characters.`;
  return null;
}

export function createRunController(runPlanAndRun: PlanAndRun): RunController {
  const active: { abort: AbortController | null } = { abort: null };

  const start = async (input: StartRunInput): Promise<void> => {
    const request = input.request.trim();
    const problem = requestProblem(request);
    if (problem) return input.send({ type: "error", message: problem });
    const parsed = parseRunOptions(input.options);
    if (!parsed.ok) return input.send({ type: "error", message: parsed.reason });
    if (active.abort) return input.send({ type: "error", message: "A parallel run is already in progress in this project." });
    const abort = new AbortController();
    active.abort = abort;
    const { runKey, send } = input;
    send({ type: "run-started", runKey, request, options: parsed.options });
    const onEvent = (event: WeaveEvent) => {
      const update = projectRunEvent(event);
      if (update) send({ type: "run-update", runKey, update });
    };
    try {
      const result = await runPlanAndRun({
        request,
        repoRoot: input.projectDir,
        config: { engine: input.engineId, fallbackEngines: (input.fallbackEngineIds ?? []).filter((id) => id !== input.engineId) },
        signal: abort.signal,
        onEvent,
        ...(parsed.options.adaptive ? { adaptive: { ...(parsed.budgets ? { budgets: parsed.budgets } : {}) } } : {}),
        ...(parsed.options.employees ? { employees: { userDir: join(input.weaveHome, USER_EMPLOYEES_DIR) } } : {}),
      });
      send({ type: "run-finished", runKey, outcome: outcomeOf(result) });
    } catch (error: unknown) {
      send({ type: "run-finished", runKey, outcome: { status: "error", reason: `Parallel run failed: ${errorMessage(error)}` } });
    } finally {
      active.abort = null;
    }
  };

  return { start, cancel: () => active.abort?.abort() };
}
