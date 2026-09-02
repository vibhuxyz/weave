import { runTask, berdDirFor, Ledger, newRunId } from "@berd/core";
import type { RunConfig, TaskContract, TaskResult } from "@berd/protocol";

/**
 * Run N tasks × M configs and collect metrics.
 *
 * The reason core has no Tauri/React/WebSocket dependency: this must run
 * unattended from a script, possibly overnight. If the path went through a
 * desktop window it would never be run often enough to produce numbers.
 */
export interface EvalConfig extends RunConfig {
  /** Shown in reports; keep it short and stable. */
  label: string;
}

export interface EvalCell {
  configLabel: string;
  taskId: string;
  result: TaskResult;
  runId: string;
}

export async function runMatrix(
  tasks: TaskContract[],
  configs: EvalConfig[],
): Promise<EvalCell[]> {
  const cells: EvalCell[] = [];

  for (const config of configs) {
    for (const task of tasks) {
      const ledger = new Ledger(berdDirFor(task.cwd, config), newRunId());
      const outcome = await runTask({ task, config, ledger });
      cells.push({
        configLabel: config.label,
        taskId: task.id,
        result: outcome.result,
        runId: outcome.runId,
      });
    }
  }

  return cells;
}
