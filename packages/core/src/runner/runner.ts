import { join, resolve } from "node:path";
import {
  compilePolicyPaths,
  getEngine,
  openSession,
  type PermissionPolicy,
} from "@weave/agent";
import type { RunConfig, TaskContract, TaskResult, WeaveEvent } from "@weave/protocol";
import { DEFAULT_RUN_CONFIG } from "@weave/protocol";
import { Ledger, newRunId, readGitStatus } from "../shared/index.ts";
import { resolveTaskWorkspace, type TaskWorkspace } from "../worktree/index.ts";
import { createRunTaskSink, type RunTaskTracker } from "./sink.ts";
import { runVerificationLadder } from "./verification.ts";
import { applyWantedConfigOptions, promptWithDeadline } from "./prompt.ts";
import { buildFailureOutcome, buildSuccessOutcome } from "./outcome.ts";
import type { RunTaskContext, RunTaskOptions, RunTaskOutcome, Session } from "./types.ts";

export type { RunTaskOptions, RunTaskOutcome } from "./types.ts";

export function weaveDirFor(cwd: string, config?: RunConfig): string {
  return config?.weaveDir ?? join(resolve(cwd), ".weave");
}

function buildTaskContract(options: RunTaskOptions, cwd: string): TaskContract {
  const compiledPolicyPaths = compilePolicyPaths(options.task.policy);
  return {
    ...options.task,
    cwd,
    allowedPaths: options.task.allowedPaths ?? compiledPolicyPaths.allowedPaths,
  };
}

async function openTaskSession(
  ctx: RunTaskContext,
  options: RunTaskOptions,
  maxTurns: number,
  tracker: RunTaskTracker,
): Promise<Session> {
  const engine = getEngine(options.config?.engine);
  let session: Session | undefined;
  session = await openSession({
    task: ctx.task,
    policy: options.policy,
    engineId: options.config?.engine,
    resumeSessionId: options.resumeSessionId ?? null,
    sink: createRunTaskSink({
      task: ctx.task,
      ledger: ctx.ledger,
      emit: ctx.emit,
      engine,
      maxTurns,
      tracker,
      requestCancel: () => void session?.cancel().catch(() => {}),
    }),
  });
  return session;
}

interface PreparedRun {
  ctx: RunTaskContext;
  workspace: TaskWorkspace;
  before: Set<string>;
  started: number;
  tracker: RunTaskTracker;
  maxTurns: number;
  timeoutMs: number;
}

async function prepareRunTask(options: RunTaskOptions): Promise<PreparedRun> {
  const repoRoot = options.task.cwd;
  const weaveDir = weaveDirFor(repoRoot, options.config);
  const workspace = await resolveTaskWorkspace({
    repoRoot,
    weaveDir,
    taskId: options.task.id,
    isolate: options.isolate ?? false,
  });
  const task = buildTaskContract(options, workspace.cwd);
  const ledger = options.ledger ?? new Ledger(weaveDir, newRunId());
  const emit = (event: WeaveEvent) => options.onEvent?.(event);
  const ctx: RunTaskContext = { task, ledger, emit };

  if (workspace.worktree) {
    emit(
      ledger.append("worktree.created", {
        taskId: task.id,
        path: workspace.worktree.path,
        branch: workspace.worktree.branch,
        baseCommit: workspace.worktree.baseCommit,
      }),
    );
  }

  const before = new Set((await readGitStatus(task.cwd)).changes.map((change) => change.path));
  const started = Date.now();
  emit(ledger.append("task.started", { taskId: task.id, cwd: task.cwd, prompt: task.prompt }));

  return {
    ctx,
    workspace,
    before,
    started,
    tracker: { turns: 0, stopped: null, finalMessage: [] },
    maxTurns: options.config?.maxTurns ?? DEFAULT_RUN_CONFIG.maxTurns,
    timeoutMs: options.config?.timeoutMs ?? DEFAULT_RUN_CONFIG.timeoutMs,
  };
}

export async function runTask(options: RunTaskOptions): Promise<RunTaskOutcome> {
  const { ctx, workspace, before, started, tracker, maxTurns, timeoutMs } = await prepareRunTask(options);
  let session: Session | null = null;

  const stopOnAbort = () => {
    if (!tracker.stopped) tracker.stopped = "aborted";
    session?.cancel().catch((error: unknown) => {
      ctx.emit(ctx.ledger.append("error", { taskId: ctx.task.id, where: "runTask.cancel", message: String(error) }));
    });
  };
  options.signal?.addEventListener("abort", stopOnAbort, { once: true });

  try {
    session = await openTaskSession(ctx, options, maxTurns, tracker);
    await applyWantedConfigOptions(ctx, session, options.config);
    const prompting = promptWithDeadline(session, ctx.task.prompt, timeoutMs, tracker);
    if (options.signal?.aborted) stopOnAbort();
    const { stopReason, usage } = await prompting;
    const wallMs = Date.now() - started;

    if (tracker.stopped && tracker.stopped !== "aborted") {
      ctx.emit(
        ctx.ledger.append("task.timeout", {
          taskId: ctx.task.id,
          reason: tracker.stopped,
          turns: tracker.turns,
          wallMs,
        }),
      );
    }

    const filesChanged = (await readGitStatus(ctx.task.cwd)).changes
      .map((change) => change.path)
      .filter((path) => !before.has(path));

    const verification = options.verifyAfter
      ? await runVerificationLadder(ctx.task, ctx.ledger, ctx.emit)
      : undefined;

    return buildSuccessOutcome({
      ctx,
      session,
      tracker,
      stopReason,
      turnUsage: usage,
      wallMs,
      filesChanged,
      verification,
      worktree: workspace.worktree,
    });
  } catch (error) {
    return buildFailureOutcome({
      ctx,
      session,
      tracker,
      error,
      wallMs: Date.now() - started,
      worktree: workspace.worktree,
    });
  } finally {
    options.signal?.removeEventListener("abort", stopOnAbort);
    session?.close();
  }
}

export async function runTasks(
  tasks: TaskContract[],
  config?: RunConfig,
  policy?: PermissionPolicy,
): Promise<{ runId: string; results: TaskResult[]; ledgerFile: string }> {
  const cwd = tasks[0]?.cwd ?? process.cwd();
  const ledger = new Ledger(weaveDirFor(cwd, config), newRunId());
  const started = Date.now();

  ledger.append("run.started", { cwd, config: (config ?? {}) as Record<string, unknown> });

  const results: TaskResult[] = [];
  for (const task of tasks) {
    const outcome = await runTask({ task, config, policy, ledger });
    results.push(outcome.result);
  }

  ledger.append("run.finished", {
    status: results.every((entry) => entry.status === "ok") ? "ok" : "failed",
    wallMs: Date.now() - started,
  });

  return { runId: ledger.runId, results, ledgerFile: ledger.file };
}
