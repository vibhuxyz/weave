import type { VERIFICATION_RUNGS } from "./constants.ts";

export type VerificationRung = (typeof VERIFICATION_RUNGS)[number];

export interface Verification {
  available: VerificationRung[];
  used: VerificationRung[];
  strength: number;
}
