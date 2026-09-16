import type { Verification, VerificationRung } from "@weave/protocol";
import type { Intake } from "../intake/index.ts";

export interface RungRun {
  rung: VerificationRung;
  strength: number;
  command: string;
  ok: boolean;
  code: number | null;
  wallMs: number;
  output: string;
}

export interface VerifyOutcome {
  ok: boolean;
  verification: Verification;
  runs: RungRun[];
  intake: Intake;
}

export interface VerifyOptions {
  command?: string;
  rung?: VerificationRung;
  intake?: Intake;
  baseline?: string;
  timeoutMs?: number;
  onRung?: (run: RungRun) => void;
}
