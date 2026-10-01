import type { SchedulableTask } from "../scheduler/index.ts";

export interface Lease {
  readonly taskId: string;
  readonly workerId: string;
  readonly token: number;
  readonly attempt: number;
  readonly expiresAtMs: number;
}

export type TaskRecord =
  | { readonly state: "queued"; readonly attempts: number; readonly lastHolder: string | null }
  | { readonly state: "leased"; readonly attempts: number; readonly lease: Lease }
  | { readonly state: "verifying"; readonly attempts: number; readonly lease: Lease }
  | { readonly state: "verified"; readonly attempts: number; readonly lease: Lease }
  | { readonly state: "failed"; readonly attempts: number; readonly reason: string };

export type TaskState = TaskRecord["state"];

export type LeaseRefusal = "expired" | "superseded" | "finished";

export type LeaseCheck = { readonly ok: true; readonly lease: Lease } | { readonly ok: false; readonly reason: LeaseRefusal };

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

interface HolderFields {
  readonly atMs: number;
  readonly taskId: string;
  readonly workerId: string;
  readonly token: number;
}

export type LeaseEvent =
  | (HolderFields & { readonly type: "leased"; readonly attempt: number; readonly previousWorkerId: string | null })
  | (HolderFields & { readonly type: "expired" })
  | (HolderFields & { readonly type: "released"; readonly reason: string })
  | (HolderFields & { readonly type: "completed" })
  | (HolderFields & { readonly type: "fenced"; readonly reason: LeaseRefusal })
  | (HolderFields & { readonly type: "verified" })
  | (HolderFields & { readonly type: "rejected"; readonly reason: string })
  | { readonly type: "failed"; readonly atMs: number; readonly taskId: string; readonly reason: string };

export interface LeaseTableOptions {
  readonly tasks: readonly SchedulableTask[];
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly onEvent?: (event: LeaseEvent) => void;
}
