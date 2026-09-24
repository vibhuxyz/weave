import type { CoordinationEvent, TaskContract } from "@weave/protocol";
import type { DependencyEdge } from "../dependencies/index.ts";
import type { EmployeeSubmission } from "../employee/index.ts";
import type { InboxBatch } from "../mailbox/index.ts";
import type { Ledger } from "../../shared/index.ts";

export type PublishResult =
  | { readonly ok: true; readonly event: CoordinationEvent }
  | { readonly ok: false; readonly reason: string };

export interface CoordinationChannel {
  readonly taskId: string;
  readonly publish: (submission: EmployeeSubmission) => PublishResult;
  readonly drain: () => InboxBatch;
}

export interface CoordinatorOptions {
  readonly tasks: readonly TaskContract[];
  readonly ledger: Ledger;
  readonly now?: () => Date;
}

export interface CoordinationReport {
  readonly addedDependencies: readonly DependencyEdge[];
  readonly escalations: readonly CoordinationEvent[];
}

export type SettledTaskStatus = "ok" | "failed" | "cancelled" | "skipped";
