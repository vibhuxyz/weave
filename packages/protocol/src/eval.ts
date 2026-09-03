/**
 * Eval fixtures and results.
 *
 * The harness measures whether an agent can actually do a task, not whether it
 * produced output. Everything here exists to keep that honest.
 */

import type { Verification, VerificationRung } from "./verification.ts";

export type FixtureCategory =
  | "bugfix"
  | "feature"
  | "refactor"
  /** Build something that is not there yet. Verified at the middle rungs. */
  | "scaffold"
  /**
   * A prompt describing a bug that is not there. A good system reports
   * "nothing to fix"; a bad one edits something anyway. The only fixture that
   * catches false positives, and the one that matters most when comparing
   * engines.
   */
  | "noop-trap";

/**
 * `greenfield` starts from an empty directory: no repo, no tests, no code
 * graph. It is a first-class path, not an edge case — most first runs look
 * like this — and it is the RISKIER one, because there is no regression net.
 */
export type FixtureKind = "existing" | "greenfield";

export interface Fixture {
  id: string;
  category: FixtureCategory;
  /** Defaults to `existing`. */
  kind?: FixtureKind;
  /**
   * Absolute path to the source repo. Copied per cell; never run in place.
   * Absent for `greenfield`, which starts from an empty directory.
   */
  repo?: string;
  /**
   * Pinned commit, so results stay comparable across runs. Checked against the
   * SOURCE repo's HEAD before the copy — `copyRepo` deletes `.git`, so it
   * cannot be checked afterwards. A mismatch is `invalid-fixture`, never a
   * silent pass.
   */
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

  /**
   * Shell command deciding pass/fail, run in the repo copy.
   *
   * Optional. When absent the verification ladder detects the strongest rung
   * the project supports and runs that — which is the whole point of the
   * ladder: a repo with no suite is still scored, at a rung that is recorded.
   */
  verify?: string;
  /**
   * Which rung `verify` represents. REQUIRED whenever `verify` is set, and the
   * loader refuses a fixture that omits it.
   *
   * There is no safe default. Guessing `tests` would quietly promote a `tsc
   * --noEmit` one-liner to rung 8 and inflate every comparison it appears in —
   * exactly the class of error the ladder exists to prevent.
   */
  verifyRung?: VerificationRung;

  /**
   * Paths the agent may not write.
   *
   * Two independent defences, and both are live: the permission policy rejects
   * tool calls whose reported locations match, AND the harness restores these
   * files from pristine before verifying. Neither is sufficient alone — a tool
   * call with no `locations` is invisible to the policy, and restore only
   * helps for files the harness owns.
   */
  readOnlyPaths?: string[];

  /**
   * The rung the finished work must REACH, for fixtures where "did it fail
   * before?" is not a usable precondition.
   *
   * This is the greenfield acceptance test. An empty directory supports only
   * `diff-review`, which passes trivially — nothing to parse, nothing deleted —
   * so scoring a scaffold the ordinary way reports a pass for producing
   * nothing. Instead: require that the result is at least buildable/bootable,
   * and fail the cell when the project never got there.
   *
   * When set, it REPLACES the `expectFail` precondition: the check becomes
   * "the starting point does not already reach this rung".
   */
  expectRungAtLeast?: VerificationRung;

  /**
   * `verify` must FAIL before the run. A fixture that already passes measures
   * nothing and quietly inflates the pass rate. False for `noop-trap`, where
   * verify must PASS before and after, and for `greenfield`, where there is
   * nothing to run yet.
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
  /** Precondition violated: bad commit pin, or verify already passed when expectFail was true. */
  | "invalid-fixture";

export interface CellResult {
  fixtureId: string;
  configId: string;
  repeat: number;
  status: CellStatus;
  /**
   * Which rung validated this cell. The matrix buckets on `strength`: a
   * rung-8 pass and a rung-4 pass are different results and averaging them
   * reports a number that describes nothing.
   */
  verification: Verification;
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

/**
 * One fixture × one config, aggregated across repeats.
 *
 * Grouped by verification strength as well as fixture and config: repeats of
 * the same cell can land on different rungs when a scaffold run fails to
 * produce something bootable, and folding those into one pass rate hides it.
 */
export interface CellSummary {
  fixtureId: string;
  configId: string;
  /** The rung these repeats were validated at. */
  strength: number;
  rungs: VerificationRung[];
  passed: number;
  total: number;
  medianWallMs: number;
  minWallMs: number;
  maxWallMs: number;
  statuses: Record<string, number>;
  totalCostUsd?: number;
}
