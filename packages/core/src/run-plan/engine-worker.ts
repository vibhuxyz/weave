import type { PermissionPolicy } from "@weave/agent";
import { DEFAULT_ENGINE_ID } from "@weave/agent";
import type { RunConfig } from "@weave/protocol";
import type { ProjectModel } from "../context/index.ts";
import { hasLiveUpdates, renderBriefing, renderUpdateBriefing } from "../coordination/index.ts";
import type { RunWorker, WorkerInput, WorkerOutcome } from "../pool/index.ts";
import { engineAttemptRunner, relayTask, type AttemptRunner, type RelayResult } from "../relay/index.ts";
import { MAX_UPDATE_ROUNDS } from "./constants.ts";

export interface EngineWorkerContext {
  readonly weaveDir: string;
  readonly model: ProjectModel | null;
  readonly runAttempt?: AttemptRunner;
  readonly routes?: ReadonlyMap<string, readonly string[]>;
}

interface RelayDeps {
  readonly engines: readonly string[];
  readonly context: EngineWorkerContext;
  readonly runAttempt: AttemptRunner;
}

export function enginesFor(config: RunConfig | undefined): readonly string[] {
  return [...new Set([config?.engine ?? DEFAULT_ENGINE_ID, ...(config?.fallbackEngines ?? [])])];
}

function toOutcome(relayed: RelayResult): WorkerOutcome {
  const status = relayed.status === "ok" ? "ok" : relayed.status === "cancelled" ? "cancelled" : "failed";
  return { status, error: relayed.error ?? undefined, finalMessage: relayed.finalMessage };
}

function relayWith(deps: RelayDeps, input: WorkerInput, briefing: string): Promise<RelayResult> {
  const { task, ledger, signal } = input;
  const engines = deps.context.routes?.get(task.id) ?? deps.engines;
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

export function engineWorker(config: RunConfig | undefined, policy: PermissionPolicy | undefined, context: EngineWorkerContext): RunWorker {
  const deps: RelayDeps = { engines: enginesFor(config), context, runAttempt: context.runAttempt ?? engineAttemptRunner(config, policy) };
  return async (input) => {
    const first = await relayWith(deps, input, renderBriefing(input.coordination.drain()));
    return toOutcome(await followUpdates(deps, input, first));
  };
}
