import type { Verification } from "./types.ts";

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

export const NO_VERIFICATION: Verification = {
  available: [],
  used: [],
  strength: 0,
};
