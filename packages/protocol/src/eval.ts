/**
 * Eval fixtures and results.
 *
 * The harness measures whether an agent can actually do a task, not whether it
 * produced output. Everything here exists to keep that honest.
 */

export type FixtureCategory =
  | "bugfix"
  | "feature"
  | "refactor"
  /**
   * A prompt describing a bug that is not there. A good system reports
   * "nothing to fix"; a bad one edits something anyway. The only fixture that
   * catches false positives, and the one that matters most when comparing
   * engines.
   */
  | "noop-trap";

export interface Fixture {
  id: string;
  category: FixtureCategory;
  /** Absolute path to the source repo. Copied per cell; never run in place. */
  repo: string;
  /** Pinned commit. The harness checks HEAD matches before running. */
  commit?: string;
  prompt: string;

  /**
   * Files the harness copies INTO the repo copy before the run, as
   * `<relative path>: <absolute source path>`.
   *
   * This is how a repo with no test suite gets one. It also closes the
   * cheating hole completely: the harness owns these files, restores them from
   * source before `verify` runs, and lists them read-only — so editing them
   * cannot affect the score even if the policy is bypassed.
   */
  injectFiles?: Record<string, string>;

  /** Shell command deciding pass/fail, run in the repo copy. */
  verify: string;

  /**
   * Paths the agent may not write. The permission policy rejects tool calls
   * touching these; the harness ALSO restores them before verifying, because a
   * policy can only see what crosses the wire.
   */
  readOnlyPaths?: string[];

  /**
   * `verify` must FAIL before the run. A fixture that already passes measures
   * nothing and quietly inflates the pass rate. False for `noop-trap`, where
   * verify must PASS before and after.
   */
  expectFail: boolean;

  /** Optional per-fixture overrides. */
  timeoutMs?: number;
  maxTurns?: number;
}

export type CellStatus =
  | "pass"
  | "fail"
  /** Hit maxTurns or timeoutMs. Kept distinct from `fail`: they mean different things. */
  | "timeout"
  /** The harness itself broke — bad precondition, copy failed, agent crashed. */
  | "error"
  /** Precondition violated: verify already passed when expectFail was true. */
  | "invalid-fixture";

export interface CellResult {
  fixtureId: string;
  configId: string;
  repeat: number;
  status: CellStatus;
  wallMs: number;
  /** Tool calls observed. See RunConfig.maxTurns for why this is the proxy. */
  turns: number;
  filesChanged: string[];
  /** From ACP `usage_update`, when the engine reports it. */
  costUsd?: number;
  contextUsed?: number;
  contextSize?: number;
  error?: string;
  /** Where the run's ledger lives, for chasing a bad cell. */
  runId?: string;
}

/** One fixture × one config, aggregated across repeats. */
export interface CellSummary {
  fixtureId: string;
  configId: string;
  passed: number;
  total: number;
  medianWallMs: number;
  minWallMs: number;
  maxWallMs: number;
  statuses: Record<string, number>;
  totalCostUsd?: number;
}
