import type { LeaseEvent } from "@weave/core";
import type { SimEvent, SimulationResult, WorkerEvent } from "../types.ts";
import { violationsOf } from "./invariants.ts";
import { spreadOf } from "./spread.ts";
import type { Metrics, Recovery } from "./types.ts";

const MS_PER_SECOND = 1_000;

type Leased = Extract<LeaseEvent, { readonly type: "leased" }>;
type Lost = Extract<WorkerEvent, { readonly type: "crashed" | "hung" }>;

function countOf(events: readonly SimEvent[], type: SimEvent["type"]): number {
  return events.filter((event) => event.type === type).length;
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): ReadonlyMap<K, readonly T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(keyOf(item));
    if (group) group.push(item);
    else groups.set(keyOf(item), [item]);
  }
  return groups;
}

function recoveriesOf(events: readonly SimEvent[]): readonly Recovery[] {
  const leasesByTask = groupBy(events.filter((event): event is Leased => event.type === "leased"), (event) => event.taskId);
  const expiredAt = new Map(events.flatMap((event) => (event.type === "expired" ? [[event.token, event.atMs] as const] : [])));
  const lateWrites = new Map(events.flatMap((event) => (event.type === "fenced" ? [[event.token, { atMs: event.atMs, reason: event.reason }] as const] : [])));
  const verifiedAt = new Map(events.flatMap((event) => (event.type === "verified" ? [[event.taskId, event.atMs] as const] : [])));
  const lost = events.filter((event): event is Lost => event.type === "crashed" || event.type === "hung");
  return lost.map((event) => {
    const next = leasesByTask.get(event.taskId)?.find((lease) => lease.token > event.token) ?? null;
    return {
      taskId: event.taskId,
      cause: event.type,
      lostWorkerId: event.workerId,
      lostAtMs: event.atMs,
      expiredAtMs: expiredAt.get(event.token) ?? null,
      takenOverBy: next?.workerId ?? null,
      takenOverAtMs: next?.atMs ?? null,
      attempt: next?.attempt ?? null,
      verifiedAtMs: verifiedAt.get(event.taskId) ?? null,
      lateWrite: lateWrites.get(event.token) ?? null,
    };
  });
}

function taskDurations(events: readonly SimEvent[]): readonly number[] {
  const firstLeased = new Map<string, number>();
  for (const event of events) if (event.type === "leased" && !firstLeased.has(event.taskId)) firstLeased.set(event.taskId, event.atMs);
  return events.flatMap((event) => (event.type === "verified" ? [event.atMs - (firstLeased.get(event.taskId) ?? event.atMs)] : []));
}

function workShares(result: SimulationResult): { readonly busyShare: number; readonly wastedShare: number } {
  const capacityMs = result.config.workers * result.endedAtMs;
  const busyMs = [...result.busyMsByToken.values()].reduce((sum, ms) => sum + ms, 0);
  const verifiedTokens = new Set(result.events.flatMap((event) => (event.type === "verified" ? [event.token] : [])));
  const usefulMs = [...result.busyMsByToken].reduce((sum, [token, ms]) => sum + (verifiedTokens.has(token) ? ms : 0), 0);
  return { busyShare: capacityMs === 0 ? 0 : busyMs / capacityMs, wastedShare: busyMs === 0 ? 0 : (busyMs - usefulMs) / busyMs };
}

export function metricsOf(result: SimulationResult): Metrics {
  const { events } = result;
  const recoveries = recoveriesOf(events);
  const recovered = recoveries.flatMap((recovery) => (recovery.takenOverAtMs === null ? [] : [recovery.takenOverAtMs - recovery.lostAtMs]));
  const verified = countOf(events, "verified");
  return {
    verified,
    failed: countOf(events, "failed"),
    crashes: countOf(events, "crashed"),
    hangs: countOf(events, "hung"),
    expiries: countOf(events, "expired"),
    takeovers: recoveries.filter((recovery) => recovery.takenOverBy !== null).length,
    fenced: countOf(events, "fenced"),
    rejected: countOf(events, "rejected"),
    heartbeats: result.heartbeats,
    makespanMs: result.endedAtMs,
    throughputPerSecond: result.endedAtMs === 0 ? 0 : verified / (result.endedAtMs / MS_PER_SECOND),
    taskMs: spreadOf(taskDurations(events)),
    recoveryMs: spreadOf(recovered),
    ...workShares(result),
    recoveries,
    violations: violationsOf(result),
  };
}
