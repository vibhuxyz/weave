import { join, resolve } from "node:path";
import { openSession, type PermissionPolicy } from "@berd/agent";
import { applyConfigOptions } from "@berd/agent";
import type {
  BerdEvent,
  RunConfig,
  SessionUpdate,
  TaskContract,
  TaskResult,
} from "@berd/protocol";
import { Ledger, newRunId } from "./ledger.ts";
import { readGitStatus } from "./git.ts";

export interface RunTaskOptions {
  task: TaskContract;
  config?: RunConfig;
  policy?: PermissionPolicy;
  /** Reuse an existing ledger (multi-task runs share one). */
  ledger?: Ledger;
  resumeSessionId?: string | null;
  /** Live feed for a UI. The ledger is written either way. */
  onEvent?: (event: BerdEvent) => void;
}

export interface RunTaskOutcome {
  result: TaskResult;
  runId: string;
  ledgerFile: string;
  sessionId: string;
}

export function berdDirFor(cwd: string, config?: RunConfig): string {
  return config?.berdDir ?? join(resolve(cwd), ".berd");
}

/**
 * Run one task end to end: spawn an agent, open a session, prompt, and record
 * everything to the ledger.
 *
 * No Tauri, no React, no WebSocket. That is the rule that keeps this runnable
 * headless from a script — which is the only way the eval harness ever gets
 * run often enough to produce numbers.
 */
export async function runTask(
  options: RunTaskOptions,
): Promise<RunTaskOutcome> {
  const { task } = options;
  const berdDir = berdDirFor(task.cwd, options.config);
  const ledger = options.ledger ?? new Ledger(berdDir, newRunId());
  const emit = (event: BerdEvent) => options.onEvent?.(event);

  // Snapshot dirty files up front so `filesChanged` reports what THIS task
  // did, not what was already uncommitted.
  const before = new Set(
    (await readGitStatus(task.cwd)).changes.map((change) => change.path),
  );

  const started = Date.now();
  emit(
    ledger.append("task.started", {
      taskId: task.id,
      cwd: task.cwd,
      prompt: task.prompt,
    }),
  );

  let session: Awaited<ReturnType<typeof openSession>> | null = null;

  try {
    session = await openSession({
      task,
      policy: options.policy,
      resumeSessionId: options.resumeSessionId ?? null,
      sink: {
        onSpawned: (pid, entry) =>
          emit(ledger.append("agent.spawned", { taskId: task.id, pid, entry })),
        onSession: (sessionId, resumed, configOptions) =>
          emit(
            ledger.append("agent.session", {
              taskId: task.id,
              sessionId,
              resumed,
              configOptions,
            }),
          ),
        onUpdate: (update: SessionUpdate) =>
          // Raw, verbatim. Deriving a nicer shape is a reader's job; throwing
          // the original away is unrecoverable.
          emit(ledger.append("agent.message", { taskId: task.id, update })),
        onPermission: (toolCall, opts, decision) => {
          emit(
            ledger.append("permission.requested", {
              taskId: task.id,
              toolCall,
              options: opts,
            }),
          );
          emit(
            ledger.append("permission.decided", {
              taskId: task.id,
              toolCall,
              decision: decision.decision,
              optionId: decision.optionId,
              reason: decision.reason,
            }),
          );
        },
        onFileRead: (path) =>
          emit(ledger.append("file.read", { taskId: task.id, path })),
        onFileWritten: (path, bytes) =>
          emit(ledger.append("file.written", { taskId: task.id, path, bytes })),
      },
    });

    const wanted = options.config?.agentConfig;
    if (wanted && Object.keys(wanted).length > 0) {
      const { refused } = await applyConfigOptions(
        (configId, value) => session!.setConfigOption(configId, value),
        wanted,
      );
      for (const [configId, message] of Object.entries(refused)) {
        emit(
          ledger.append("error", {
            taskId: task.id,
            where: `setConfigOption(${configId})`,
            message,
          }),
        );
      }
    }

    const { stopReason } = await session.prompt(task.prompt);
    const wallMs = Date.now() - started;
    const filesChanged = (await readGitStatus(task.cwd)).changes
      .map((change) => change.path)
      .filter((path) => !before.has(path));

    const result: TaskResult = {
      taskId: task.id,
      status: "ok",
      stopReason,
      wallMs,
      filesWritten: session.filesWritten(),
      filesChanged,
    };
    emit(
      ledger.append("task.finished", {
        taskId: task.id,
        status: "ok",
        stopReason,
        wallMs,
      }),
    );

    return {
      result,
      runId: ledger.runId,
      ledgerFile: ledger.file,
      sessionId: session.sessionId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const wallMs = Date.now() - started;
    emit(
      ledger.append("error", { taskId: task.id, where: "runTask", message }),
    );
    emit(
      ledger.append("task.finished", {
        taskId: task.id,
        status: "failed",
        wallMs,
      }),
    );
    return {
      result: {
        taskId: task.id,
        status: "failed",
        wallMs,
        filesWritten: session?.filesWritten() ?? [],
        filesChanged: [],
        error: message,
      },
      runId: ledger.runId,
      ledgerFile: ledger.file,
      sessionId: session?.sessionId ?? "",
    };
  } finally {
    session?.close();
  }
}

/** Run tasks in order. The scheduler (V0.2) replaces this with a DAG. */
export async function runTasks(
  tasks: TaskContract[],
  config?: RunConfig,
  policy?: PermissionPolicy,
): Promise<{ runId: string; results: TaskResult[]; ledgerFile: string }> {
  const cwd = tasks[0]?.cwd ?? process.cwd();
  const ledger = new Ledger(berdDirFor(cwd, config), newRunId());
  const started = Date.now();

  ledger.append("run.started", {
    cwd,
    config: (config ?? {}) as Record<string, unknown>,
  });

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
