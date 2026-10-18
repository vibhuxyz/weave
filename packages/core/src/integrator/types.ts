import type { VerificationRung } from "@weave/protocol";
import type { Ledger } from "../shared/index.ts";

export interface MergeCandidate {
  readonly taskId: string;
  readonly branch: string;
  readonly commit: string | null;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly rungs: readonly VerificationRung[];
  readonly detail: string;
}

export type VerifyWorkspace = (cwd: string, baseCommit: string) => Promise<VerifyResult>;

export interface MergeConflict {
  readonly cwd: string;
  readonly taskId: string;
  readonly branch: string;
  readonly files: readonly string[];
}

export type ConflictFix = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type ResolveConflict = (conflict: MergeConflict) => Promise<ConflictFix>;

export interface IntegrateOptions {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly baseCommit: string;
  readonly candidates: readonly MergeCandidate[];
  readonly verify: VerifyWorkspace;
  readonly shouldInstall?: boolean;
  readonly resolveConflict?: ResolveConflict;
}

export type MergeStatus = "merged" | "empty" | "conflict" | "merge-error" | "verify-failed" | "not-run";

export interface MergeReport {
  readonly taskId: string;
  readonly status: MergeStatus;
  readonly commit: string | null;
  readonly rungs: readonly VerificationRung[];
  readonly detail: string;
  readonly verifyMs?: number;
}

export interface IntegrationReport {
  readonly status: "ok" | "failed" | "unverified";
  readonly branch: string | null;
  readonly head: string | null;
  readonly brokenBy: string | null;
  readonly baseline: VerifyResult | null;
  readonly merges: readonly MergeReport[];
  readonly detail: string;
}
