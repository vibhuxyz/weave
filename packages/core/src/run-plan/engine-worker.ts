import type { PermissionPolicy } from "@weave/agent";
import { DEFAULT_ENGINE_ID } from "@weave/agent";
import type { RunConfig } from "@weave/protocol";
import type { ProjectModel } from "../context/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { engineAttemptRunner, relayTask } from "../relay/index.ts";

export interface EngineWorkerContext {
  readonly weaveDir: string;
  readonly model: ProjectModel | null;
}

export function enginesFor(config: RunConfig | undefined): readonly string[] {
  return [...new Set([config?.engine ?? DEFAULT_ENGINE_ID, ...(config?.fallbackEngines ?? [])])];
}

export function engineWorker(config: RunConfig | undefined, policy: PermissionPolicy | undefined, context: EngineWorkerContext): RunWorker {
  const runAttempt = engineAttemptRunner(config, policy);
  return async ({ task, ledger, signal }) => {
    const relayed = await relayTask({ task, engines: enginesFor(config), weaveDir: context.weaveDir, ledger, model: context.model, runAttempt, signal });
    const status = relayed.status === "ok" ? "ok" : relayed.status === "cancelled" ? "cancelled" : "failed";
    return { status, error: relayed.error ?? undefined, finalMessage: relayed.finalMessage };
  };
}
