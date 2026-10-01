import { LeaseTable, type Lease, type LeaseEvent } from "@weave/core";
import { MAX_SIM_MS, MAX_SIM_STEPS } from "../constants.ts";
import type { SimEvent, SimulationConfig, SimulationResult } from "../types.ts";
import { EventQueue } from "./event-queue.ts";
import { expectedOutputOf, fateOf, outputOf, planTasks, slotIdOf } from "./plan.ts";

const WRONG_OUTPUT_REASON = "the output did not match what the task should produce";
const WAKING_EVENTS: ReadonlySet<LeaseEvent["type"]> = new Set(["expired", "released", "rejected", "verified", "failed"]);

type Step =
  | { readonly kind: "ready"; readonly slotId: string }
  | { readonly kind: "beat"; readonly slotId: string; readonly token: number }
  | { readonly kind: "done"; readonly slotId: string; readonly token: number; readonly output: string }
  | { readonly kind: "crash"; readonly slotId: string; readonly token: number }
  | { readonly kind: "hang"; readonly slotId: string; readonly token: number }
  | { readonly kind: "wake"; readonly slotId: string; readonly token: number; readonly output: string }
  | { readonly kind: "restart"; readonly slotId: string }
  | { readonly kind: "sweep" }
  | { readonly kind: "verify"; readonly taskId: string; readonly output: string };

interface Identity {
  readonly workerId: string;
  readonly incarnation: number;
}

type Working = Identity & { readonly state: "busy" | "hung"; readonly lease: Lease; readonly sinceMs: number };
type Slot = (Identity & { readonly state: "idle" | "down" }) | Working;

function identityOf(slotId: string, incarnation: number): Identity {
  return { workerId: incarnation === 1 ? slotId : `${slotId}#${incarnation}`, incarnation };
}

class Simulation {
  private readonly queue = new EventQueue<Step>();
  private readonly slots = new Map<string, Slot>();
  private readonly waiting = new Set<string>();
  private readonly events: SimEvent[] = [];
  private readonly busyMsByToken = new Map<number, number>();
  private readonly table: LeaseTable;
  private readonly config: SimulationConfig;
  private nowMs = 0;
  private heartbeats = 0;
  private hasChanged = false;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.table = new LeaseTable({ tasks: planTasks(config), leaseMs: config.leaseMs, maxAttempts: config.maxAttempts, onEvent: (event) => this.onLeaseEvent(event) });
  }

  run(): SimulationResult {
    for (let index = 0; index < this.config.workers; index += 1) {
      this.slots.set(slotIdOf(index), { state: "idle", ...identityOf(slotIdOf(index), 1) });
      this.queue.push(0, { kind: "ready", slotId: slotIdOf(index) });
    }
    this.queue.push(this.config.sweepMs, { kind: "sweep" });
    for (let steps = 0; steps < MAX_SIM_STEPS; steps += 1) {
      const next = this.queue.pop();
      if (next === null || next.atMs > MAX_SIM_MS) break;
      this.nowMs = next.atMs;
      this.handle(next.item);
      if (!this.hasChanged) continue;
      this.wakeWaiting();
      if (this.table.isFinished()) break;
    }
    const { config, events, heartbeats, busyMsByToken } = this;
    return { config, events, heartbeats, busyMsByToken, endedAtMs: this.nowMs, isComplete: this.table.isFinished(), finalStates: this.table.counts() };
  }

  private handle(step: Step): void {
    switch (step.kind) {
      case "ready": return this.onReady(step.slotId);
      case "beat": return this.onBeat(step.slotId, step.token);
      case "done": return this.onDone(step);
      case "crash": return this.onCrash(step.slotId, step.token);
      case "hang": return this.onHang(step.slotId, step.token);
      case "wake": return this.onWake(step);
      case "restart": return this.onRestart(step.slotId);
      case "sweep": return this.onSweep();
      case "verify": return this.onVerify(step.taskId, step.output);
      default: {
        const unreachable: never = step;
        return unreachable;
      }
    }
  }

  private onLeaseEvent(event: LeaseEvent): void {
    this.events.push(event);
    if (WAKING_EVENTS.has(event.type)) this.hasChanged = true;
  }

  private wakeWaiting(): void {
    this.hasChanged = false;
    for (const slotId of [...this.waiting].sort()) this.queue.push(this.nowMs, { kind: "ready", slotId });
    this.waiting.clear();
  }

  private holding(slotId: string, token: number, state: Working["state"]): Working | null {
    const slot = this.slots.get(slotId);
    return slot !== undefined && slot.state === state && "lease" in slot && slot.lease.token === token ? slot : null;
  }

  private onReady(slotId: string): void {
    const slot = this.slots.get(slotId);
    if (slot?.state !== "idle") return;
    const lease = this.table.claim(slot.workerId, this.nowMs);
    if (lease === null) {
      this.waiting.add(slotId);
      return;
    }
    this.slots.set(slotId, { ...slot, state: "busy", lease, sinceMs: this.nowMs });
    const { token, taskId } = lease;
    const fate = fateOf(this.config, taskId, lease.attempt);
    this.queue.push(this.nowMs + this.config.heartbeatMs, { kind: "beat", slotId, token });
    if (fate.kind === "crash") return this.queue.push(this.nowMs + fate.afterMs, { kind: "crash", slotId, token });
    if (fate.kind === "hang") {
      this.queue.push(this.nowMs + fate.afterMs, { kind: "hang", slotId, token });
      return this.queue.push(this.nowMs + fate.afterMs + this.config.hangMs, { kind: "wake", slotId, token, output: expectedOutputOf(taskId) });
    }
    this.queue.push(this.nowMs + fate.workMs, { kind: "done", slotId, token, output: outputOf(taskId, fate) });
  }

  private onBeat(slotId: string, token: number): void {
    const slot = this.holding(slotId, token, "busy");
    if (slot === null) return;
    this.heartbeats += 1;
    const renewed = this.table.renew(slot.lease, this.nowMs);
    if (!renewed.ok) return this.endAttempt(slotId, slot);
    this.slots.set(slotId, { ...slot, lease: renewed.lease });
    this.queue.push(this.nowMs + this.config.heartbeatMs, { kind: "beat", slotId, token });
  }

  private onDone(step: Extract<Step, { readonly kind: "done" }>): void {
    const slot = this.holding(step.slotId, step.token, "busy");
    if (slot === null) return;
    this.submit(slot.lease, step.output);
    this.endAttempt(step.slotId, slot);
  }

  private onCrash(slotId: string, token: number): void {
    const slot = this.holding(slotId, token, "busy");
    if (slot === null) return;
    this.events.push({ type: "crashed", atMs: this.nowMs, workerId: slot.workerId, taskId: slot.lease.taskId, token });
    this.busyMsByToken.set(token, this.nowMs - slot.sinceMs);
    this.slots.set(slotId, { state: "down", workerId: slot.workerId, incarnation: slot.incarnation });
    this.queue.push(this.nowMs + this.config.restartMs, { kind: "restart", slotId });
  }

  private onHang(slotId: string, token: number): void {
    const slot = this.holding(slotId, token, "busy");
    if (slot === null) return;
    this.events.push({ type: "hung", atMs: this.nowMs, workerId: slot.workerId, taskId: slot.lease.taskId, token });
    this.slots.set(slotId, { ...slot, state: "hung" });
  }

  private onWake(step: Extract<Step, { readonly kind: "wake" }>): void {
    const slot = this.holding(step.slotId, step.token, "hung");
    if (slot === null) return;
    this.events.push({ type: "woke", atMs: this.nowMs, workerId: slot.workerId, taskId: slot.lease.taskId, token: step.token });
    this.submit(slot.lease, step.output);
    this.endAttempt(step.slotId, slot);
  }

  private onRestart(slotId: string): void {
    const incarnation = (this.slots.get(slotId)?.incarnation ?? 0) + 1;
    const identity = identityOf(slotId, incarnation);
    this.events.push({ type: "restarted", atMs: this.nowMs, workerId: identity.workerId });
    this.slots.set(slotId, { state: "idle", ...identity });
    this.queue.push(this.nowMs, { kind: "ready", slotId });
  }

  private onSweep(): void {
    this.table.expire(this.nowMs);
    this.queue.push(this.nowMs + this.config.sweepMs, { kind: "sweep" });
  }

  private onVerify(taskId: string, output: string): void {
    const isExpected = output === expectedOutputOf(taskId);
    this.table.verify(taskId, isExpected ? { ok: true } : { ok: false, reason: WRONG_OUTPUT_REASON }, this.nowMs);
  }

  private submit(lease: Lease, output: string): void {
    const completed = this.table.complete(lease, this.nowMs);
    if (completed.ok) this.queue.push(this.nowMs + this.config.verifyMs, { kind: "verify", taskId: lease.taskId, output });
  }

  private endAttempt(slotId: string, slot: Working): void {
    this.busyMsByToken.set(slot.lease.token, this.nowMs - slot.sinceMs);
    this.slots.set(slotId, { state: "idle", workerId: slot.workerId, incarnation: slot.incarnation });
    this.queue.push(this.nowMs, { kind: "ready", slotId });
  }
}

export function simulate(config: SimulationConfig): SimulationResult {
  return new Simulation(config).run();
}
