import { Readiness } from "./readiness.ts";
import type { Lease, LeaseCheck, LeaseEvent, LeaseTableOptions, TaskRecord, TaskState, Verdict } from "./types.ts";

type Held = Extract<TaskRecord, { readonly state: "leased" }>;
type Confirmed = { readonly ok: true; readonly record: Held } | Extract<LeaseCheck, { readonly ok: false }>;

export class LeaseTable {
  private readonly records = new Map<string, TaskRecord>();
  private readonly leasedIds = new Set<string>();
  private readonly readiness: Readiness;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly emit: (event: LeaseEvent) => void;
  private lastToken = 0;
  private settledCount = 0;

  constructor(options: LeaseTableOptions) {
    this.readiness = new Readiness(options.tasks);
    this.leaseMs = options.leaseMs;
    this.maxAttempts = options.maxAttempts;
    this.emit = options.onEvent ?? (() => undefined);
    for (const task of options.tasks) this.records.set(task.id, { state: "queued", attempts: 0, lastHolder: null });
  }

  claim(workerId: string, nowMs: number): Lease | null {
    const taskId = this.readiness.next((id) => this.records.get(id)?.state === "queued");
    const record = taskId === null ? undefined : this.records.get(taskId);
    if (taskId === null || record?.state !== "queued") return null;
    this.lastToken += 1;
    const lease: Lease = { taskId, workerId, token: this.lastToken, attempt: record.attempts + 1, expiresAtMs: nowMs + this.leaseMs };
    this.setRecord(taskId, { state: "leased", attempts: lease.attempt, lease });
    this.emit({ type: "leased", atMs: nowMs, taskId, workerId, token: lease.token, attempt: lease.attempt, previousWorkerId: record.lastHolder });
    return lease;
  }

  renew(lease: Lease, nowMs: number): LeaseCheck {
    const confirmed = this.confirmHolder(lease, nowMs);
    if (!confirmed.ok) return confirmed;
    const renewed: Lease = { ...confirmed.record.lease, expiresAtMs: nowMs + this.leaseMs };
    this.setRecord(lease.taskId, { ...confirmed.record, lease: renewed });
    return { ok: true, lease: renewed };
  }

  complete(lease: Lease, nowMs: number): LeaseCheck {
    const confirmed = this.confirmHolder(lease, nowMs);
    if (!confirmed.ok) {
      this.emit({ type: "fenced", atMs: nowMs, ...holderOf(lease), reason: confirmed.reason });
      return confirmed;
    }
    this.setRecord(lease.taskId, { state: "verifying", attempts: confirmed.record.attempts, lease: confirmed.record.lease });
    this.emit({ type: "completed", atMs: nowMs, ...holderOf(lease) });
    return { ok: true, lease: confirmed.record.lease };
  }

  release(lease: Lease, reason: string, nowMs: number): LeaseCheck {
    const confirmed = this.confirmHolder(lease, nowMs);
    if (!confirmed.ok) return confirmed;
    this.emit({ type: "released", atMs: nowMs, ...holderOf(lease), reason });
    this.requeue(confirmed.record, nowMs);
    return { ok: true, lease: confirmed.record.lease };
  }

  expire(nowMs: number): readonly Lease[] {
    const expired = [...this.leasedIds].flatMap((taskId) => {
      const record = this.records.get(taskId);
      return record?.state === "leased" && record.lease.expiresAtMs < nowMs ? [record] : [];
    });
    for (const record of expired) this.expireOne(record, nowMs);
    return expired.map((record) => record.lease);
  }

  verify(taskId: string, verdict: Verdict, nowMs: number): void {
    const record = this.records.get(taskId);
    if (record?.state !== "verifying") return;
    if (!verdict.ok) {
      this.emit({ type: "rejected", atMs: nowMs, ...holderOf(record.lease), reason: verdict.reason });
      this.requeue(record, nowMs);
      return;
    }
    this.setRecord(taskId, { state: "verified", attempts: record.attempts, lease: record.lease });
    this.settledCount += 1;
    this.emit({ type: "verified", atMs: nowMs, ...holderOf(record.lease) });
    this.readiness.verified(taskId);
  }

  recordOf(taskId: string): TaskRecord | undefined {
    return this.records.get(taskId);
  }

  counts(): Readonly<Record<TaskState, number>> {
    const counts: Record<TaskState, number> = { queued: 0, leased: 0, verifying: 0, verified: 0, failed: 0 };
    for (const record of this.records.values()) counts[record.state] += 1;
    return counts;
  }

  isFinished(): boolean {
    return this.settledCount === this.records.size;
  }

  private setRecord(taskId: string, record: TaskRecord): void {
    this.records.set(taskId, record);
    if (record.state === "leased") this.leasedIds.add(taskId);
    else this.leasedIds.delete(taskId);
  }

  private confirmHolder(lease: Lease, nowMs: number): Confirmed {
    const record = this.records.get(lease.taskId);
    if (record === undefined) return { ok: false, reason: "superseded" };
    if (record.state === "queued") return { ok: false, reason: "expired" };
    if (record.state === "failed") return { ok: false, reason: "finished" };
    if (record.lease.token !== lease.token) return { ok: false, reason: "superseded" };
    if (record.state !== "leased") return { ok: false, reason: "finished" };
    if (record.lease.expiresAtMs >= nowMs) return { ok: true, record };
    this.expireOne(record, nowMs);
    return { ok: false, reason: "expired" };
  }

  private expireOne(record: Held, nowMs: number): void {
    this.emit({ type: "expired", atMs: nowMs, ...holderOf(record.lease) });
    this.requeue(record, nowMs);
  }

  private requeue(record: Extract<TaskRecord, { readonly lease: Lease }>, nowMs: number): void {
    const { lease, attempts } = record;
    const brokenBy = this.readiness.dependenciesOf(lease.taskId).find((id) => this.records.get(id)?.state === "failed");
    if (brokenBy !== undefined) return this.fail(lease.taskId, `dependency ${brokenBy} ended as failed`, nowMs);
    if (attempts >= this.maxAttempts) return this.fail(lease.taskId, `gave up after ${attempts} attempt(s)`, nowMs);
    this.setRecord(lease.taskId, { state: "queued", attempts, lastHolder: lease.workerId });
    this.readiness.retry(lease.taskId);
  }

  private fail(taskId: string, reason: string, nowMs: number): void {
    const pending = [{ taskId, reason }];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      const record = this.records.get(next.taskId);
      if (record === undefined || record.state === "verified" || record.state === "failed") continue;
      this.setRecord(next.taskId, { state: "failed", attempts: record.attempts, reason: next.reason });
      this.settledCount += 1;
      this.emit({ type: "failed", atMs: nowMs, taskId: next.taskId, reason: next.reason });
      const failedId = next.taskId;
      const waiting = this.readiness.dependentsOf(failedId).filter((id) => this.records.get(id)?.state === "queued");
      pending.push(...waiting.map((id) => ({ taskId: id, reason: `dependency ${failedId} ended as failed` })));
    }
  }
}

function holderOf(lease: Lease): { readonly taskId: string; readonly workerId: string; readonly token: number } {
  return { taskId: lease.taskId, workerId: lease.workerId, token: lease.token };
}

