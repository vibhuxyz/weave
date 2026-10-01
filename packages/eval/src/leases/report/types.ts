import type { LeaseRefusal } from "@weave/core";

export interface Recovery {
  readonly taskId: string;
  readonly cause: "crashed" | "hung";
  readonly lostWorkerId: string;
  readonly lostAtMs: number;
  readonly expiredAtMs: number | null;
  readonly takenOverBy: string | null;
  readonly takenOverAtMs: number | null;
  readonly attempt: number | null;
  readonly verifiedAtMs: number | null;
  readonly lateWrite: { readonly atMs: number; readonly reason: LeaseRefusal } | null;
}

export interface Violation {
  readonly name: string;
  readonly problem: string;
}

export interface Spread {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

export interface Metrics {
  readonly verified: number;
  readonly failed: number;
  readonly crashes: number;
  readonly hangs: number;
  readonly expiries: number;
  readonly takeovers: number;
  readonly fenced: number;
  readonly rejected: number;
  readonly heartbeats: number;
  readonly makespanMs: number;
  readonly throughputPerSecond: number;
  readonly taskMs: Spread | null;
  readonly recoveryMs: Spread | null;
  readonly busyShare: number;
  readonly wastedShare: number;
  readonly recoveries: readonly Recovery[];
  readonly violations: readonly Violation[];
}
