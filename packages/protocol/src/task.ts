/**
 * What a task is allowed to do, and what came of it.
 *
 * `allowedPaths` exists so the permission policy has something to consult that
 * is not "yes". With one agent and a human at the window, auto-approve was
 * survivable. With N agents running unattended it is the only thing between a
 * plan and `rm -rf`, so the contract has to carry the boundary.
 */

export interface TaskContract {
  id: string;
  prompt: string;
  /** Absolute path the agent runs in — a repo, or a worktree of one. */
  cwd: string;
  /**
   * Globs, relative to `cwd`, this task may write to. `["**"]` means the whole
   * worktree. Reads are governed separately and are wider by default.
   */
  allowedPaths?: string[];
  /** Tasks that must finish before this one may start. */
  dependsOn?: string[];
  /** Shell command that decides whether the task actually worked. */
  verify?: string;
}

export type TaskStatus = "pending" | "running" | "ok" | "failed" | "cancelled";

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  /** ACP's reason for ending the turn, e.g. `end_turn`, `refusal`. */
  stopReason?: string;
  wallMs: number;
  /**
   * Files the agent wrote **through ACP's writeTextFile**. Often empty even on
   * a successful edit: Claude Code has its own Edit tool and only asks
   * permission, so nothing routes through the client. Use `filesChanged` for
   * "did anything actually happen".
   */
  filesWritten: string[];
  /**
   * Paths git reports as dirty after the task, minus those already dirty
   * before it. Deterministic evidence, independent of which tool the agent
   * chose. Empty when the task dir is not a git repo.
   */
  filesChanged: string[];
  error?: string;
}
