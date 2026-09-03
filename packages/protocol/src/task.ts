/**
 * What a task is allowed to do, and what came of it.
 *
 * With one agent and a human at the window, auto-approve was survivable. With
 * N agents running unattended it is the only thing between a plan and
 * `rm -rf`, so the contract has to carry the boundary.
 */

import type { Verification, VerificationRung } from "./verification.ts";

export interface TaskContract {
  id: string;
  prompt: string;
  /** Absolute path the agent runs in — a repo, or a worktree of one. */
  cwd: string;
  /**
   * Globs, relative to `cwd`, this task may write to. `["**"]` means the whole
   * worktree. Reads are governed separately and are wider by default.
   *
   * NOT ENFORCED YET — nothing narrows on it; `confineToTaskDir` checks the
   * task cwd and nothing smaller. Narrowing needs worktrees, so it lands at
   * MVP.1. Contrast `readOnlyPaths`, which IS enforced.
   */
  allowedPaths?: string[];
  /**
   * Globs, relative to `cwd`, this task may NOT write to — the test suite,
   * when there is one.
   *
   * Enforced by `confineToTaskDir`: a tool call reporting a location under one
   * of these is rejected. This is deliberately a *deny* list rather than the
   * inverse of `allowedPaths`, because deny needs no worktree to be meaningful
   * and the cheating hole it closes is live today.
   *
   * It is one of two defences and not sufficient alone: many tool calls report
   * no `locations` at all, so the policy cannot see where they write. The eval
   * harness restores these files from pristine before verifying, which catches
   * what the policy cannot.
   */
  readOnlyPaths?: string[];
  /** Tasks that must finish before this one may start. */
  dependsOn?: string[];
  /**
   * Shell command that decides whether the task actually worked.
   *
   * Optional: when absent, the verification ladder picks the strongest rung
   * the project supports. A repo with no test suite is verified, not refused.
   */
  verify?: string;
  /**
   * Which rung `verify` represents. Required whenever `verify` is set.
   *
   * There is no safe default, and `tests` is the worst possible guess: it
   * would score a one-line `tsc --noEmit` at the top of the ladder and make it
   * incomparable with an actual suite. Same rule as `Fixture.verifyRung`.
   */
  verifyRung?: VerificationRung;
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
  /**
   * Which rung validated this result. Absent when the caller did not verify.
   * Never compare two results without comparing this first.
   */
  verification?: Verification;
  error?: string;
}
