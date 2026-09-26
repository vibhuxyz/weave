import { createGuardedPermissionPolicy, openSession, PLAN_MODE_ID } from "@weave/agent";
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
  readonly reviewerEngineId?: string;
}

function engineTurn(cwd: string, ledger: Ledger, engineId: string | undefined): { run: TurnRunner; close: () => void } {
  const parts: string[] = [];
  const thoughtParts: string[] = [];
  let sessionPromise: Promise<Awaited<ReturnType<typeof openSession>>> | null = null;

  const openPlannerSession = () =>
    openSession({
      engineId,
      policy: createGuardedPermissionPolicy(undefined, { currentModeId: () => PLAN_MODE_ID }),
      task: { id: PLANNER_WORKTREE_ID, prompt: "", cwd },
      sink: {
        onUpdate: (update) => {
          ledger.append("agent.message", { taskId: PLANNER_WORKTREE_ID, update });
          if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") parts.push(update.content.text);
          if (update.sessionUpdate === "agent_thought_chunk" && update.content.type === "text") thoughtParts.push(update.content.text);
        },
        onPermission: (toolCall, options, decision) => {
          ledger.append("permission.requested", { taskId: PLANNER_WORKTREE_ID, toolCall, options });
          ledger.append("permission.decided", { taskId: PLANNER_WORKTREE_ID, toolCall, decision: decision.decision, optionId: decision.optionId, reason: decision.reason });
        },
        onFileRead: () => undefined,
        onFileWritten: (path) => ledger.append("error", { where: "planner", message: `planner wrote ${path}; the planner worktree is discarded` }),
        onSpawned: () => undefined,
        onSession: () => undefined,
        onCapabilities: () => undefined,
      },
    });

  const run: TurnRunner = async (prompt, signal) => {
    if (signal?.aborted) return "";
    parts.length = 0;
    thoughtParts.length = 0;
    sessionPromise ??= openPlannerSession();

    const session = await sessionPromise;
    const cancel = () => {
      session.cancel().catch((error: unknown) => {
        ledger.append("error", { where: "planner.cancel", message: String(error) });
      });
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await session.prompt([{ type: "text", text: prompt }]);
      if (signal?.aborted) return "";
      const text = parts.join("");
      return text.trim() ? text : thoughtParts.join("");
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  };

  const close = () => {
    if (sessionPromise) {
      sessionPromise.then(session => session.close()).catch(() => {});
    }
  };

  return { run, close };
}

export async function openCoordinatorTurn(input: PlannerWorkspaceInput): Promise<{ readonly runTurn: TurnRunner; readonly close: () => Promise<void> }> {
  const worktree = await createWorktree({
    repoRoot: input.repoRoot,
    weaveDir: input.weaveDir,
    taskId: PLANNER_WORKTREE_ID,
    runId: input.ledger.runId,
    baseRef: input.baseRef,
  });
  const coordinator = engineTurn(worktree.path, input.ledger, input.engineId);
  const close = async (): Promise<void> => {
    coordinator.close();
    await removeWorktree(input.repoRoot, worktree, { deleteBranch: true });
  };
  return { runTurn: coordinator.run, close };
}

export async function withPlannerWorkspace<T>(
  input: PlannerWorkspaceInput,
  work: (runTurn: TurnRunner, reviewTurn: TurnRunner) => Promise<T>,
): Promise<T> {
  const worktree = await createWorktree({
    repoRoot: input.repoRoot,
    weaveDir: input.weaveDir,
    taskId: PLANNER_WORKTREE_ID,
    runId: input.ledger.runId,
    baseRef: input.baseRef,
  });
  
  const reviewerEngineId = input.reviewerEngineId ?? input.engineId;
  const planner = engineTurn(worktree.path, input.ledger, input.engineId);
  const reviewer = engineTurn(worktree.path, input.ledger, reviewerEngineId);
  
  try {
    return await work(planner.run, reviewer.run);
  } finally {
    planner.close();
    reviewer.close();
    await removeWorktree(input.repoRoot, worktree, { deleteBranch: true });
  }
}
