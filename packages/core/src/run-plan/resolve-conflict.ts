import type { TaskContract } from "@weave/protocol";
import { Coordinator } from "../coordination/index.ts";
import type { ConflictFix, ResolveConflict } from "../integrator/index.ts";
import type { RunWorker, WorkerOutcome } from "../pool/index.ts";
import type { Ledger } from "../shared/index.ts";
import { buildConflictPrompt } from "./conflict-prompt.ts";
import { MERGE_FIX_TASK_PREFIX } from "./constants.ts";

export interface ConflictResolverInput {
  readonly ledger: Ledger;
  readonly runWorker: RunWorker;
  readonly signal: AbortSignal;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fixOf(outcome: WorkerOutcome): ConflictFix {
  if (outcome.status === "ok") return { ok: true };
  return { ok: false, reason: outcome.error ?? `the merge fixer ended as ${outcome.status}` };
}

export function conflictResolver(input: ConflictResolverInput): ResolveConflict {
  return async (conflict) => {
    const task: TaskContract = {
      id: `${MERGE_FIX_TASK_PREFIX}${conflict.taskId}`,
      cwd: conflict.cwd,
      prompt: buildConflictPrompt(conflict),
      allowedPaths: [...conflict.files],
    };
    const coordination = new Coordinator({ tasks: [task], ledger: input.ledger }).channelFor(task.id);
    const outcome = await input.runWorker({ task, ledger: input.ledger, signal: input.signal, coordination })
      .catch((error: unknown): WorkerOutcome => ({ status: "failed", error: `merge fixer crashed: ${errorText(error)}` }));
    return fixOf(outcome);
  };
}
