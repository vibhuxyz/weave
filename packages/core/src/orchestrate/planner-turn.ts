import { openSession, rejectAll } from "@weave/agent";
import { PLANNER_WORKTREE_ID } from "../run-plan/index.ts";
import type { Ledger } from "../shared/index.ts";
import { createWorktree, removeWorktree } from "../worktree/index.ts";
import type { TurnRunner } from "./types.ts";

export interface PlannerWorkspaceInput {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly baseRef?: string;
  readonly engineId?: string;
}

function engineTurn(cwd: string, ledger: Ledger, engineId: string | undefined): TurnRunner {
  return async (prompt, signal) => {
    const parts: string[] = [];
    const session = await openSession({
      engineId,
      policy: rejectAll,
      task: { id: PLANNER_WORKTREE_ID, prompt: "", cwd },
      sink: {
        onUpdate: (update) => {
          if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") parts.push(update.content.text);
        },
        onPermission: () => undefined,
        onFileRead: () => undefined,
        onFileWritten: (path) => ledger.append("error", { where: "planner", message: `planner wrote ${path}; the planner worktree is discarded` }),
        onSpawned: () => undefined,
        onSession: () => undefined,
        onCapabilities: () => undefined,
      },
    });
    const cancel = () => {
      session.cancel().catch((error: unknown) => {
        ledger.append("error", { where: "planner.cancel", message: String(error) });
      });
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await session.prompt([{ type: "text", text: prompt }]);
      return parts.join("");
    } finally {
      signal?.removeEventListener("abort", cancel);
      session.close();
    }
  };
}

export async function withPlannerWorkspace<T>(
  input: PlannerWorkspaceInput,
  work: (runTurn: TurnRunner) => Promise<T>,
): Promise<T> {
  const worktree = await createWorktree({
    repoRoot: input.repoRoot,
    weaveDir: input.weaveDir,
    taskId: PLANNER_WORKTREE_ID,
    runId: input.ledger.runId,
    baseRef: input.baseRef,
  });
  try {
    return await work(engineTurn(worktree.path, input.ledger, input.engineId));
  } finally {
    await removeWorktree(input.repoRoot, worktree, { deleteBranch: true });
  }
}
