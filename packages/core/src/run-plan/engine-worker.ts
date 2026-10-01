import type { PermissionPolicy, PromptImage } from "@weave/agent";
import { DEFAULT_ENGINE_ID } from "@weave/agent";
import type { RunConfig } from "@weave/protocol";
import { moveToFront } from "../adaptive/index.ts";
import type { ProjectModel } from "../context/index.ts";
import { hasLiveUpdates, renderBriefing, renderPublishNudge, renderUpdateBriefing } from "../coordination/index.ts";
import type { RunWorker, WorkerInput, WorkerOutcome } from "../pool/index.ts";
import { engineAttemptRunner, relayTask, type AttemptRunner, type RelayResult } from "../relay/index.ts";
import { MAX_UPDATE_ROUNDS } from "./constants.ts";

export interface EngineWorkerContext {
  readonly weaveDir: string;
  readonly model: ProjectModel | null;
  readonly runAttempt?: AttemptRunner;
  readonly routes?: ReadonlyMap<string, readonly string[]>;
  readonly briefings?: ReadonlyMap<string, string>;
  readonly images?: readonly PromptImage[];
}

interface RelayDeps {
  readonly engines: readonly string[];
  readonly context: EngineWorkerContext;
  readonly runAttempt: AttemptRunner;
}

export function enginesFor(config: RunConfig | undefined): readonly string[] {
  return [...new Set([config?.engine ?? DEFAULT_ENGINE_ID, ...(config?.fallbackEngines ?? [])])];
}

function describeFailure(relayed: RelayResult): string {
  const engines = relayed.attempts.map((attempt) => attempt.engineId).join(", ");
  const stopped = relayed.attempts.flatMap((attempt) => (attempt.endedBy === null ? [] : [attempt.endedBy]));
  const where = engines === "" ? "no engine ran" : `tried ${engines}`;
  const why = stopped.length > 0 ? `, stopped by ${[...new Set(stopped)].join(", ")}` : "";
  return `the engine reported no error (${where}${why})`;
}

function toOutcome(relayed: RelayResult): WorkerOutcome {
  const status = relayed.status === "ok" ? "ok" : relayed.status === "cancelled" ? "cancelled" : "failed";
  const error = relayed.error ?? (status === "failed" ? describeFailure(relayed) : undefined);
  return { status, error, finalMessage: relayed.finalMessage };
}

function engineChainFor(deps: RelayDeps, task: WorkerInput["task"]): readonly string[] {
  const chain = deps.context.routes?.get(task.id) ?? deps.engines;
  return task.engine !== undefined && chain.includes(task.engine) ? moveToFront(chain, task.engine) : chain;
}

function relayWith(deps: RelayDeps, input: WorkerInput, briefing: string): Promise<RelayResult> {
  const { task, ledger, signal } = input;
  const engines = engineChainFor(deps, task);
  return relayTask({ task, engines, weaveDir: deps.context.weaveDir, ledger, model: deps.context.model, runAttempt: deps.runAttempt, signal, briefing });
}

async function followUpdates(deps: RelayDeps, input: WorkerInput, first: RelayResult): Promise<RelayResult> {
  let relayed = first;
  for (let round = 1; round <= MAX_UPDATE_ROUNDS; round += 1) {
    if (relayed.status !== "ok" || input.signal.aborted) return relayed;
    const batch = input.coordination.drain();
    if (!hasLiveUpdates(batch)) return relayed;
    relayed = await relayWith(deps, input, renderUpdateBriefing(batch));
  }
  return relayed;
}

async function askToPublish(deps: RelayDeps, input: WorkerInput, done: RelayResult): Promise<RelayResult> {
  if (done.status !== "ok" || input.signal.aborted) return done;
  const nudge = renderPublishNudge(input.coordination.awaited(), input.coordination.published());
  if (nudge === null) return done;
  input.ledger.append("error", { taskId: input.task.id, where: "coordination.publish", message: nudge.split("\n")[0] ?? nudge });
  return relayWith(deps, input, nudge);
}

export function engineWorker(config: RunConfig | undefined, policy: PermissionPolicy | undefined, context: EngineWorkerContext): RunWorker {
  const deps: RelayDeps = { engines: enginesFor(config), context, runAttempt: context.runAttempt ?? engineAttemptRunner(config, policy, context.images) };
  return async (input) => {
    const employeeBrief = context.briefings?.get(input.task.id);
    const briefing = [...(employeeBrief ? [employeeBrief] : []), renderBriefing(input.coordination.drain(), input.coordination.awaited())].join("\n\n");
    const first = await relayWith(deps, input, briefing);
    const published = await askToPublish(deps, input, first);
    return toOutcome(await followUpdates(deps, input, published));
  };
}
