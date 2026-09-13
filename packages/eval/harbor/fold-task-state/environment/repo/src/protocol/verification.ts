/**
 * The verification ladder.
 *
 * A repo with no test suite still has verifiable behaviour. Refusing such a
 * repo would rule out most first runs — greenfield scaffolds have no tests by
 * definition, and that is the path the target user hits first. So: detect what
 * the project supports, use the strongest rung available, and **record which
 * one validated the run**.
 *
 * Ordered WEAKEST to STRONGEST, so `strength` is monotonic and "use the
 * strongest available rung" is literally `max(strength)`.
 *
 *   1  diff-review   structural sanity: still parses, no deleted exports
 *   2  lint          a linter is configured and passes
 *   3  typecheck     tsc --noEmit
 *   4  build         the project compiles/bundles
 *   5  boot          the process starts and stays up
 *   6  health        it comes up and answers a health check
 *   7  smoke         a scripted request flow succeeds
 *   8  tests         the project's own suite passes
 *
 * The single most important rule about this scale: **a rung-8 pass and a
 * rung-1 pass are not the same result, and the harness must never average
 * them.** A matrix that reports one pass rate across mixed rungs is measuring
 * nothing in particular.
 */

export const VERIFICATION_RUNGS = [
  "diff-review",
  "lint",
  "typecheck",
  "build",
  "boot",
  "health",
  "smoke",
  "tests",
] as const;

export type VerificationRung = (typeof VERIFICATION_RUNGS)[number];

/** 1 (weakest) … 8 (strongest). Higher is stronger evidence. */
export function rungStrength(rung: VerificationRung): number {
  return VERIFICATION_RUNGS.indexOf(rung) + 1;
}

/** The strongest of a set, or null when the set is empty. */
export function strongestRung(
  rungs: readonly VerificationRung[],
): VerificationRung | null {
  let best: VerificationRung | null = null;
  for (const rung of rungs) {
    if (!best || rungStrength(rung) > rungStrength(best)) best = rung;
  }
  return best;
}

/**
 * What actually validated a run.
 *
 * A first-class field on every result and every ledger entry. Without it the
 * eval matrix silently compares a repo whose suite passed against one where a
 * process merely stayed up for five seconds.
 */
export interface Verification {
  /** Rungs detected at intake. */
  available: VerificationRung[];
  /** Rungs actually executed. */
  used: VerificationRung[];
  /** `max(rungStrength(used))`, or 0 when nothing ran. For bucketing. */
  strength: number;
}

export const NO_VERIFICATION: Verification = {
  available: [],
  used: [],
  strength: 0,
};

/** Build a `Verification` from what was detected and what ran. */
export function verificationOf(
  available: readonly VerificationRung[],
  used: readonly VerificationRung[],
): Verification {
  const best = strongestRung(used);
  return {
    available: [...available],
    used: [...used],
    strength: best ? rungStrength(best) : 0,
  };
}
