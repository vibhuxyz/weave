import type { PermissionPolicy } from "@weave/agent";
import type { RunConfig } from "@weave/protocol";
import { runTask } from "../runner/index.ts";
import type { AttemptRunner } from "./types.ts";

export function engineAttemptRunner(config: RunConfig | undefined, policy: PermissionPolicy | undefined): AttemptRunner {
  return async ({ engineId, task, ledger, signal }) => {
    const outcome = await runTask({ task, config: { ...config, engine: engineId }, policy, ledger, signal });
    const status = outcome.result.status === "ok" || outcome.result.status === "cancelled" ? outcome.result.status : "failed";
    return {
      status,
      stoppedBy: outcome.stoppedBy,
      error: outcome.result.error ?? null,
      contextUsed: outcome.contextUsed ?? null,
      contextSize: outcome.contextSize ?? null,
      finalMessage: outcome.finalMessage,
    };
  };
}
