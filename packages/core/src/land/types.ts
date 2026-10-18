import type { VerificationRung } from "@weave/protocol";
import type { IntegrationReport, MergeStatus } from "../integrator/index.ts";
import type { PoolTaskReport } from "../pool/index.ts";
export interface LandOptions {
  readonly repoRoot: string;
  readonly runBranch: string;
  readonly integrationRef: string;
  readonly checkout?: boolean;
}

export interface LandSummary {
  readonly branch: string;
  readonly head: string;
  readonly previousHead: string | null;
  readonly checkedOut: boolean;
  readonly changedFiles: readonly string[];
}

export type LandResult =
  | { readonly ok: true; readonly landed: LandSummary }
  | { readonly ok: false; readonly reason: string };

export interface CommitProjectOptions {
  readonly repoRoot: string;
  readonly runBranch: string;
  readonly message: string;
}

export interface ProjectCommit {
  readonly branch: string;
  readonly commit: string | null;
  readonly changedFiles: readonly string[];
}

export type CommitProjectResult =
  | { readonly ok: true; readonly committed: ProjectCommit }
  | { readonly ok: false; readonly reason: string };

export type WorkerState = "verified" | "completed" | "rejected" | "failed" | "cancelled" | "skipped";

export interface WorkerResult {
  readonly taskId: string;
  readonly state: WorkerState;
  readonly reason: string | null;
  readonly ranIn: PoolTaskReport["ranIn"];
  readonly branch: string | null;
  readonly commit: string | null;
  readonly files: readonly string[];
  readonly merge: { readonly status: MergeStatus; readonly checks: readonly VerificationRung[]; readonly detail: string } | null;
}

export type DeliveryStatus = IntegrationReport["status"] | "not-merged";

export interface DeliveryPlan {
  readonly runId: string;
  readonly baseCommit: string;
  readonly snapshotOf: string | null;
  readonly integrationHead: string | null;
  readonly integrationStatus: DeliveryStatus;
  readonly detail: string;
  readonly sharedFiles: readonly string[];
  readonly isolatedFiles: readonly string[];
  readonly mergedFiles: readonly string[];
  readonly workers: readonly WorkerResult[];
}

export type DeliveryResult = { readonly ok: true; readonly summary: string } | { readonly ok: false; readonly reason: string };
