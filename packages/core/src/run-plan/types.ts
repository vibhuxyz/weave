import type { PermissionPolicy } from "@weave/agent";
import type { RunConfig, TaskContract } from "@weave/protocol";
import type { IntegrationReport, VerifyWorkspace } from "../integrator/index.ts";
import type { InspectHarvest, PoolReport, RunWorker } from "../pool/index.ts";
import type { Ledger } from "../shared/index.ts";

export interface RunPlanOptions {
  readonly tasks: readonly TaskContract[];
  readonly repoRoot: string;
  readonly concurrency: number;
  readonly config?: RunConfig;
  readonly policy?: PermissionPolicy;
  readonly runWorker?: RunWorker;
  readonly verify?: VerifyWorkspace;
  readonly signal?: AbortSignal;
  readonly shouldInstall?: boolean;
  readonly baseRef?: string;
  readonly ledger?: Ledger;
  readonly inspectHarvest?: InspectHarvest;
  readonly revise?: Reviser;
}

export interface RevisionInput {
  readonly pool: PoolReport;
  readonly baseCommit: string;
  readonly round: number;
  readonly freshTaskIds: ReadonlySet<string>;
}

export interface Revision {
  readonly baseCommit: string;
  readonly rerun: readonly TaskContract[];
}

export type Reviser = (input: RevisionInput) => Promise<Revision | null>;

export interface RunPlanReport {
  readonly runId: string;
  readonly ledgerFile: string;
  readonly baseCommit: string;
  readonly status: "ok" | "failed" | "cancelled" | "unverified";
  readonly pool: PoolReport;
  readonly integration: IntegrationReport | null;
}

export type RunPlanResult =
  | { readonly ok: true; readonly value: RunPlanReport }
  | { readonly ok: false; readonly reason: string };
