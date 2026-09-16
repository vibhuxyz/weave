export type VerificationRung =
  | "diff-review"
  | "lint"
  | "typecheck"
  | "build"
  | "boot"
  | "health"
  | "smoke"
  | "tests";

export interface Verification {
  available: VerificationRung[];
  used: VerificationRung[];
  strength: number;
}
