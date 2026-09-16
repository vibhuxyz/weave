import type { Verification, VerificationRung } from "./types.ts";

export const VERIFICATION_RUNGS: readonly VerificationRung[] = [
  "diff-review",
  "lint",
  "typecheck",
  "build",
  "boot",
  "health",
  "smoke",
  "tests",
] as const;

export const NO_VERIFICATION: Verification = {
  available: [],
  used: [],
  strength: 0,
};
