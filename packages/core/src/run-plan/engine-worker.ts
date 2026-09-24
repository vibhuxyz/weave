import type { PermissionPolicy } from "@weave/agent";
import type { RunConfig } from "@weave/protocol";
import type { RunWorker, WorkerOutcome } from "../pool/index.ts";
import { runTask } from "../runner/index.ts";

export function engineWorker(config: RunConfig | undefined, policy: PermissionPolicy | undefined): RunWorker {
  return async ({ task, ledger, signal }) => {
    const { result, finalMessage } = await runTask({ task, config, policy, ledger, signal });
    switch (result.status) {
      case "ok":
      case "failed":
      case "cancelled":
        return { status: result.status, error: result.error, finalMessage };
      case "pending":
      case "running":
        return { status: "failed", error: `engine returned unfinished status ${result.status}`, finalMessage } satisfies WorkerOutcome;
      default: {
        const unreachable: never = result.status;
        return unreachable;
      }
    }
  };
}
