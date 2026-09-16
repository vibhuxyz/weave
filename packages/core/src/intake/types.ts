import type { VerificationRung } from "@weave/protocol";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export interface RungTeardown {
  command: string;
  skipIfOutput: string;
}

export type RungExecution =
  | { via: "command"; command: string; teardown?: RungTeardown }
  | { via: "boot"; command: string; holdMs: number }
  | { via: "diff-review" };

export interface DetectedRung {
  rung: VerificationRung;
  strength: number;
  execution: RungExecution;
  why: string;
}

export interface MissingRung {
  rung: VerificationRung;
  why: string;
}

export interface Intake {
  cwd: string;
  isGitRepo: boolean;
  branch: string | null;
  head: string | null;
  clean: boolean;
  packageManager: PackageManager | null;
  hasPackageJson: boolean;
  detected: DetectedRung[];
  missing: MissingRung[];
}

export interface IntakeOptions {
  bootHoldMs?: number;
}
