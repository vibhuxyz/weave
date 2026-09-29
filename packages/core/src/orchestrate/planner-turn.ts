import { applyConfigOptions, createGuardedPermissionPolicy, openSession, PLAN_MODE_ID } from "@weave/agent";
import { agentConfigFrom, type RunConfig } from "@weave/protocol";
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
  /** The engines the coordinator may fall back to, in order, when one refuses. */
  readonly engineIds?: readonly string[];
  readonly config?: RunConfig;
}

type EngineChain = readonly (string | undefined)[];

function chainFor(first: string | undefined, all: readonly string[] | undefined): EngineChain {
  const rest = (all ?? []).filter((id) => id !== first);
  return first === undefined && rest.length === 0 ? [undefined] : [first, ...rest];
}

async function applyChosenOptions(session: Awaited<ReturnType<typeof openSession>>, config: RunConfig | undefined, ledger: Ledger): Promise<void> {
  const wanted = config ? agentConfigFrom(config) : {};
  if (Object.keys(wanted).length === 0) return;
  const { refused } = await applyConfigOptions((configId, value) => session.setConfigOption(configId, value), wanted);
  for (const [configId, message] of Object.entries(refused)) {
    ledger.append("error", { taskId: PLANNER_WORKTREE_ID, where: `setConfigOption(${configId})`, message });
  }
}

function engineTurn(cwd: string, ledger: Ledger, chain: EngineChain, config: RunConfig | undefined): { run: TurnRunner; close: () => void } {
  const parts: string[] = [];
  const thoughtParts: string[] = [];
  let sessionPromise: Promise<Awaited<ReturnType<typeof openSession>>> | null = null;
  let cursor = 0;

  const openPlannerSession = async (engineId: string | undefined) => {
    const session = await openSession({
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
    await applyChosenOptions(session, config, ledger);
    return session;
  };

  const promptOnce = async (engineId: string | undefined, prompt: string, signal: AbortSignal | undefined): Promise<string> => {
    parts.length = 0;
    thoughtParts.length = 0;
    sessionPromise ??= openPlannerSession(engineId);
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

  const dropSession = async (): Promise<void> => {
    const open = sessionPromise;
    sessionPromise = null;
    if (open) await open.then((session) => session.close()).catch(() => undefined);
  };

  /**
   * The coordinator gets the same courtesy as a worker: an engine that hits a
   * usage limit or falls over hands the turn to the next one, instead of
   * ending the whole run.
   */
  const run: TurnRunner = async (prompt, signal) => {
    if (signal?.aborted) return "";
    let last: unknown = null;
    for (; cursor < chain.length; cursor += 1) {
      try {
        return await promptOnce(chain[cursor], prompt, signal);
      } catch (error: unknown) {
        if (signal?.aborted) return "";
        last = error;
        ledger.append("error", { taskId: PLANNER_WORKTREE_ID, where: "planner", message: `${chain[cursor] ?? "the configured engine"} could not answer: ${error instanceof Error ? error.message : String(error)}` });
        await dropSession();
      }
    }
    throw last;
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
  const coordinator = engineTurn(worktree.path, input.ledger, chainFor(input.engineId, input.engineIds), input.config);
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
  const planner = engineTurn(worktree.path, input.ledger, chainFor(input.engineId, input.engineIds), input.config);
  const reviewer = engineTurn(worktree.path, input.ledger, chainFor(reviewerEngineId, input.engineIds), input.config);
  
  try {
    return await work(planner.run, reviewer.run);
  } finally {
    planner.close();
    reviewer.close();
    await removeWorktree(input.repoRoot, worktree, { deleteBranch: true });
  }
}
