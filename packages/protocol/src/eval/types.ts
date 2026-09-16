import type { Verification, VerificationRung } from "../verification/index.ts";

export type FixtureCategory =
  | "bugfix"
  | "feature"
  | "refactor"
  | "scaffold"
  | "noop-trap";

export type FixtureKind = "existing" | "greenfield";

export interface Fixture {
  id: string;
  category: FixtureCategory;
  kind?: FixtureKind;
  repo?: string;
  commit?: string;
  prompt: string;
  injectFiles?: Record<string, string>;
  verify?: string;
  verifyRung?: VerificationRung;
  readOnlyPaths?: string[];
  expectRungAtLeast?: VerificationRung;
  expectFail: boolean;
  timeoutMs?: number;
  maxTurns?: number;
}

export type CellStatus =
  | "pass"
  | "fail"
  | "timeout"
  | "error"
  | "invalid-fixture";

export interface CellResult {
  fixtureId: string;
  configId: string;
  repeat: number;
  status: CellStatus;
  verification: Verification;
  wallMs: number;
  turns: number;
  filesChanged: string[];
  costUsd?: number;
  contextUsed?: number;
  contextSize?: number;
  error?: string;
  runId?: string;
}

export interface CellSummary {
  fixtureId: string;
  configId: string;
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
