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
import { DEFAULT_RUN_CONFIG, agentConfigFrom } from "@berd/protocol";
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
  /** Tool calls observed. The runaway signal — see RunConfig.maxTurns. */
  turns: number;
  /** From ACP `usage_update`, when the engine reports it. */
  costUsd?: number;
  contextUsed?: number;
  contextSize?: number;
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
  let turns = 0;
  let costUsd: number | undefined;
  let contextUsed: number | undefined;
  let contextSize: number | undefined;
  /** Set when a cap trips, so the result reports `timeout` rather than `ok`. */
  let stopped: "maxTurns" | "timeoutMs" | null = null;

  const maxTurns = options.config?.maxTurns ?? DEFAULT_RUN_CONFIG.maxTurns;
  const timeoutMs = options.config?.timeoutMs ?? DEFAULT_RUN_CONFIG.timeoutMs;

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
        onUpdate: (update: SessionUpdate) => {
          // Raw, verbatim. Deriving a nicer shape is a reader's job; throwing
          // the original away is unrecoverable.
          emit(ledger.append("agent.message", { taskId: task.id, update }));

          if (update.sessionUpdate === "tool_call") {
            turns += 1;
            if (turns > maxTurns && !stopped) {
              stopped = "maxTurns";
              void session?.cancel().catch(() => {});
            }
          }

          if (update.sessionUpdate === "usage_update") {
            contextUsed = update.used;
            contextSize = update.size;
            if (update.cost) costUsd = update.cost.amount;
            emit(
              ledger.append("usage", {
                taskId: task.id,
                used: update.used,
                size: update.size,
                costUsd: update.cost?.amount,
              }),
            );
          }
        },
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

    const wanted = options.config ? agentConfigFrom(options.config) : {};
    if (Object.keys(wanted).length > 0) {
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

    // Race the prompt against the wall clock. An unattended run with no cap
    // means one looping agent burns budget until morning.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<{ stopReason: string }>((resolve) => {
      timer = setTimeout(() => {
        if (!stopped) stopped = "timeoutMs";
        void session?.cancel().catch(() => {});
        resolve({ stopReason: "timeout" });
      }, timeoutMs);
    });

    const { stopReason } = await Promise.race([
      session.prompt(task.prompt),
      deadline,
    ]).finally(() => clearTimeout(timer));

    const wallMs = Date.now() - started;

    if (stopped) {
      emit(
        ledger.append("task.timeout", {
          taskId: task.id,
          reason: stopped,
          turns,
          wallMs,
        }),
      );
    }
    const filesChanged = (await readGitStatus(task.cwd)).changes
      .map((change) => change.path)
      .filter((path) => !before.has(path));

    const result: TaskResult = {
      taskId: task.id,
      status: stopped ? "cancelled" : "ok",
      stopReason,
      wallMs,
      filesWritten: session.filesWritten(),
      filesChanged,
    };
    emit(
      ledger.append("task.finished", {
        taskId: task.id,
        status: stopped ? "cancelled" : "ok",
        stopReason,
        wallMs,
      }),
    );

    return {
      result,
      runId: ledger.runId,
      ledgerFile: ledger.file,
      sessionId: session.sessionId,
      turns,
      costUsd,
      contextUsed,
      contextSize,
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
      turns,
      costUsd,
      contextUsed,
      contextSize,
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
