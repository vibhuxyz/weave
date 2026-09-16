import { VERIFICATION_RUNGS } from "./constants.ts";
import type { Verification, VerificationRung } from "./types.ts";

export function rungStrength(rung: VerificationRung): number {
  return VERIFICATION_RUNGS.indexOf(rung) + 1;
}

export function strongestRung(
  rungs: readonly VerificationRung[],
): VerificationRung | null {
  let best: VerificationRung | null = null;
  for (const rung of rungs) {
    if (!best || rungStrength(rung) > rungStrength(best)) {
      best = rung;
    }
  }
  return best;
}

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
