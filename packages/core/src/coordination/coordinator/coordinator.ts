import { randomUUID } from "node:crypto";
import { WEAVE_SENDER, type CoordinationDraft, type CoordinationEvent, type DependencyNeed, type TaskContract } from "@weave/protocol";
import type { Ledger } from "../../shared/index.ts";
import { publishedOutputKey } from "../../scheduler/index.ts";
import { ArtifactStore, DependencyGraph, artifactKey, invalidatedConsumers, staleConsumers, type ArtifactInput, type ArtifactKind } from "../dependencies/index.ts";
import type { EmployeeSubmission } from "../employee/index.ts";
import { Mailboxes, recipientsFor, type InboxBatch } from "../mailbox/index.ts";
import { OwnershipRegistry, claimsForTask, describeResource } from "../ownership/index.ts";
import { buildEvent } from "./envelope.ts";
import { decideExpansion } from "./expand-scope.ts";
import { latestByOutput } from "./artifact-index.ts";
import { declaredProducersOf, findProducer, promisedProducersOf } from "./find-producer.ts";
import { subtaskIndex } from "./subtask-index.ts";
import type { CoordinationChannel, CoordinationReport, CoordinatorOptions, ExpandedScope, PublishResult, SettledTaskStatus } from "./types.ts";
import { watchEmployeeMessages } from "./watch-ledger.ts";

interface OpenNeed {
  readonly consumer: string;
  readonly producer: string;
  readonly output: string;
  readonly correlationId: string;
}

const ESCALATION_TYPES: ReadonlySet<CoordinationEvent["type"]> = new Set(["escalation.created", "review.requested"]);

export class Coordinator {
  private readonly ledger: Ledger;
  private readonly now: () => Date;
  private readonly contextFor: (paths: readonly string[]) => string;
  private readonly graph: DependencyGraph<TaskContract>;
  private readonly artifacts = new ArtifactStore();
  private readonly mailboxes = new Mailboxes();
  private readonly ownership = new OwnershipRegistry();
  private readonly lastArtifactEvents = new Map<string, CoordinationEvent>();
  private readonly consumed = new Map<string, Map<string, number>>();
  private readonly blockedTasks = new Set<string>();
  private openNeeds: readonly OpenNeed[] = [];
  private readonly expanded: ExpandedScope[] = [];
  private seq = 0;
  private wake: { promise: Promise<void>; resolve: () => void } = Coordinator.waiter();

  constructor(options: CoordinatorOptions) {
    this.ledger = options.ledger;
    this.now = options.now ?? (() => new Date());
    this.contextFor = options.contextFor ?? (() => "");
    this.graph = new DependencyGraph(options.tasks);
  }

  private static waiter(): { promise: Promise<void>; resolve: () => void } {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((settle) => { resolve = settle; });
    return { promise, resolve };
  }

  tasks(): readonly TaskContract[] {
    return this.graph.current();
  }

  publishedKeys(): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const [producer, names] of this.artifacts.outputsByProducer()) {
      for (const name of names) keys.add(publishedOutputKey(producer, name));
    }
    return keys;
  }

  nextChange(): Promise<void> {
    return this.wake.promise;
  }

  watch(ledger: Ledger): () => void {
    return watchEmployeeMessages(ledger, (taskId, submission) => this.submit(taskId, submission));
  }

  channelFor(taskId: string): CoordinationChannel {
    return {
      taskId,
      publish: (submission) => this.submit(taskId, submission),
      drain: () => this.drain(taskId),
      awaited: () => this.graph.dependentsOf(taskId),
      published: () => this.artifacts.outputsByProducer().get(taskId) ?? new Set(),
    };
  }

  private recordClaim(taskId: string, claimed: ReturnType<OwnershipRegistry["claim"]>): void {
    if (claimed.ok) {
      if (claimed.resources.length > 0) this.ledger.append("ownership.claimed", { taskId, resources: [...claimed.resources] });
      return;
    }
    const conflicts = claimed.conflicts.map((conflict) => `${describeResource(conflict.resource)} held by ${conflict.heldBy}`).sort();
    this.ledger.append("ownership.blocked", { taskId, conflicts });
  }

  tryClaim(task: TaskContract): boolean {
    const claimed = this.ownership.claim(task.id, claimsForTask(task));
    if (claimed.ok) {
      this.blockedTasks.delete(task.id);
      if (claimed.resources.length > 0) this.ledger.append("ownership.claimed", { taskId: task.id, resources: [...claimed.resources] });
      return true;
    }
    return false;
  }

  claim(task: TaskContract): boolean {
    if (this.tryClaim(task)) return true;
    if (this.blockedTasks.has(task.id)) return false;
    this.blockedTasks.add(task.id);
    const claimed = this.ownership.claim(task.id, claimsForTask(task));
    if (claimed.ok) return true; // Just in case
    const conflicts = claimed.conflicts.map((conflict) => `${describeResource(conflict.resource)} overlaps ${describeResource(conflict.held)} held by ${conflict.heldBy}`);
    this.ledger.append("ownership.blocked", { taskId: task.id, conflicts });
    this.emit(task.id, { type: "task.blocked", data: { reason: `waiting for ownership: ${conflicts.join("; ")}` } });
    return false;
  }

  taskStarted(taskId: string): void {
    this.emit(taskId, { type: "task.started", data: {} });
    const dependencies = this.graph.current().find((task) => task.id === taskId)?.dependencies ?? [];
    if (dependencies.length === 0) return;
    const required = [...new Set(dependencies.flatMap((dependency) => dependency.requiredOutputs))].sort();
    const outputs = required.filter((output) => this.artifacts.producersOf(output).length > 0);
    const pending = required.filter((output) => this.artifacts.producersOf(output).length === 0);
    this.redeliverPublished(taskId, outputs);
    this.emit(WEAVE_SENDER, { type: "dependency.ready", data: { consumer: taskId, outputs, pending } });
  }

  private redeliverPublished(consumer: string, outputs: readonly string[]): void {
    const wanted = new Set(outputs);
    const waiting = this.mailboxes.peek(consumer);
    for (const event of this.lastArtifactEvents.values()) {
      if (!("artifact" in event.data)) continue;
      const carried = [event.data.artifact.name, ...event.data.artifact.provides];
      if (!carried.some((output) => wanted.has(output)) || waiting.includes(event)) continue;
      this.mailboxes.deliver(consumer, event);
    }
  }

  taskSettled(taskId: string, status: SettledTaskStatus): void {
    if (this.ownership.release(taskId)) this.ledger.append("ownership.released", { taskId });
    this.emit(taskId, { type: "task.completed", data: { status } });
    const unmet = this.openNeeds.filter((need) => need.producer === taskId);
    this.openNeeds = this.openNeeds.filter((need) => need.producer !== taskId);
    for (const need of unmet) {
      const reason = `${taskId} ended as ${status} without publishing ${need.output}`;
      this.emit(WEAVE_SENDER, { type: "escalation.created", data: { subject: `${need.consumer} needs ${need.output}`, reason } }, need.correlationId);
    }
  }

  submit(taskId: string, submission: EmployeeSubmission): PublishResult {
    if (!this.graph.has(taskId)) return { ok: false, reason: `Unknown task ${taskId}` };
    switch (submission.type) {
      case "artifact.ready":
      case "artifact.updated":
        return { ok: true, event: this.publishArtifact(taskId, "artifact", submission.data.artifact) };
      case "contract.published":
      case "contract.changed":
        return { ok: true, event: this.publishArtifact(taskId, "contract", submission.data.artifact) };
      case "dependency.blocked":
        return { ok: true, event: this.requestDependency(taskId, submission.data.need, submission.data.reason) };
      case "scope.expand":
        return { ok: true, event: this.expandScope(taskId, submission.data.paths, submission.data.reason) };
      case "subtask.completed":
        return { ok: true, event: this.recordSubtask(taskId, submission.data.subtask) };
      case "task.blocked":
      case "review.requested":
      case "verification.failed":
      case "verification.passed":
      case "escalation.created":
        return { ok: true, event: this.emit(taskId, submission) };
      default: {
        const unhandled: never = submission;
        return unhandled;
      }
    }
  }

  invalidations(isOk: (taskId: string) => boolean): ReadonlyMap<string, string> {
    const staleReasons = staleConsumers({ consumed: this.consumed, latestVersion: (key) => this.artifacts.latestVersion(key) });
    return invalidatedConsumers({ tasks: this.graph.current(), isOk, staleReasons });
  }

  report(): CoordinationReport {
    const escalations = this.mailboxes.peek(WEAVE_SENDER).filter((event) => ESCALATION_TYPES.has(event.type));
    return { addedDependencies: [...this.graph.added()], escalations };
  }

  private drain(taskId: string): InboxBatch {
    const batch = this.mailboxes.drain(taskId);
    const versions = this.consumed.get(taskId) ?? new Map<string, number>();
    for (const event of batch.events) {
      if (!("artifact" in event.data)) continue;
      const key = artifactKey(event.from, event.data.artifact.name);
      versions.set(key, Math.max(versions.get(key) ?? 0, event.data.artifact.version));
    }
    if (versions.size > 0) this.consumed.set(taskId, versions);
    return batch;
  }

  private publishArtifact(producer: string, kind: ArtifactKind, input: ArtifactInput): CoordinationEvent {
    const published = this.artifacts.publish(producer, kind, input);
    const type = published.kind === "contract"
      ? (published.isUpdate ? "contract.changed" : "contract.published")
      : (published.isUpdate ? "artifact.updated" : "artifact.ready");
    const event = this.emit(producer, { type, data: { artifact: published.artifact } });
    this.lastArtifactEvents.set(artifactKey(producer, published.artifact.name), event);
    this.resolveNeeds(producer);
    this.notifyChange();
    return event;
  }

  private requestDependency(consumer: string, need: DependencyNeed, reason: string): CoordinationEvent {
    const found = findProducer({
      consumer,
      need,
      hasTask: (taskId) => this.graph.has(taskId),
      ownerOf: (resource) => this.ownership.ownerOf(resource),
      publishersOf: (output) => this.artifacts.producersOf(output),
      promisedProducersOf: (output) => promisedProducersOf(this.graph.current(), output),
      declaredProducersOf: (output) => declaredProducersOf(this.graph.current(), output),
    });
    const routedNeed = found.ok ? { ...need, task: found.producer } : need;
    const request = this.emit(consumer, { type: "dependency.blocked", data: { need: routedNeed, reason } });
    if (!found.ok) return this.escalate(request, `${consumer} needs ${need.output}`, found.reason);
    const added = this.graph.add(consumer, found.producer, need.output);
    if (!added.ok) return this.escalate(request, `${consumer} needs ${need.output}`, added.reason);
    if (added.isNew) this.ledger.append("dependency.added", { taskId: consumer, on: found.producer, outputs: [need.output], reason });
    this.openNeeds = [...this.openNeeds, { consumer, producer: found.producer, output: need.output, correlationId: request.correlationId }];
    this.resolveNeeds(found.producer);
    this.notifyChange();
    return request;
  }

  private expandScope(taskId: string, paths: readonly string[], reason: string): CoordinationEvent {
    const request = this.emit(taskId, { type: "scope.expand", data: { paths: [...paths], reason } });
    const task = this.graph.current().find((candidate) => candidate.id === taskId);
    if (!task) return this.escalate(request, `${taskId} asked to expand its scope`, `Unknown task ${taskId}`);

    const decision = decideExpansion({ task, paths, ownerOf: (resource) => this.ownership.ownerOf(resource) });
    if (!decision.ok) {
      this.emit(WEAVE_SENDER, { type: "scope.denied", data: { taskId, paths: [...paths], reason: decision.reason } }, request.correlationId);
      this.ledger.append("scope.denied", { taskId, paths: [...paths], reason: decision.reason });
      return request;
    }

    const claimed = this.ownership.claim(taskId, decision.claims);
    if (!claimed.ok) {
      const reasons = claimed.conflicts.map((conflict) => `${describeResource(conflict.resource)} held by ${conflict.heldBy}`).sort().join("; ");
      this.emit(WEAVE_SENDER, { type: "scope.denied", data: { taskId, paths: [...decision.paths], reason: reasons } }, request.correlationId);
      this.ledger.append("scope.denied", { taskId, paths: [...decision.paths], reason: reasons });
      return request;
    }

    this.graph.widenScope(taskId, decision.paths);
    const context = this.contextFor(decision.paths);
    this.expanded.push({ taskId, paths: decision.paths, reason });
    this.emit(WEAVE_SENDER, { type: "scope.granted", data: { taskId, paths: [...decision.paths], context } }, request.correlationId);
    this.ledger.append("scope.expanded", { taskId, paths: [...decision.paths], reason });
    this.notifyChange();
    return request;
  }

  expansions(): readonly ExpandedScope[] {
    return this.expanded;
  }

  admit(tasks: readonly TaskContract[]): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
    const admitted = this.graph.admit(tasks);
    if (!admitted.ok) return admitted;
    this.notifyChange();
    return { ok: true };
  }

  retarget(taskId: string, patch: Partial<TaskContract>): boolean {
    if (!this.graph.replace(taskId, patch)) return false;
    const task = this.graph.current().find((candidate) => candidate.id === taskId);
    if (task) this.recordClaim(taskId, this.ownership.claim(taskId, claimsForTask(task)));
    this.notifyChange();
    return true;
  }

  private recordSubtask(taskId: string, subtask: string): CoordinationEvent {
    const declared = this.graph.current().find((task) => task.id === taskId)?.subtasks ?? [];
    return this.emit(taskId, { type: "subtask.completed", data: { subtask, index: subtaskIndex(declared, subtask) } });
  }

  private escalate(cause: CoordinationEvent, subject: string, reason: string): CoordinationEvent {
    this.emit(WEAVE_SENDER, { type: "escalation.created", data: { subject, reason } }, cause.correlationId);
    return cause;
  }

  private resolveNeeds(producer: string): void {
    if (!this.openNeeds.some((need) => need.producer === producer)) return;
    const satisfied = latestByOutput(this.lastArtifactEvents.values(), producer);
    const resolvable = this.openNeeds.flatMap((need) => {
      const event = need.producer === producer ? satisfied.get(need.output) : undefined;
      return event ? [{ need, event }] : [];
    });
    if (resolvable.length === 0) return;
    const resolved = new Set(resolvable.map((entry) => entry.need));
    this.openNeeds = this.openNeeds.filter((need) => !resolved.has(need));
    for (const { need, event } of resolvable) {
      if (!this.mailboxes.peek(need.consumer).includes(event)) this.mailboxes.deliver(need.consumer, event);
      this.emit(WEAVE_SENDER, { type: "dependency.resolved", data: { consumer: need.consumer, producer, output: need.output } }, need.correlationId);
    }
  }

  private emit(from: string, draft: CoordinationDraft, correlationId?: string): CoordinationEvent {
    const id = randomUUID();
    this.seq += 1;
    const event = buildEvent(draft, { id, from, seq: this.seq, occurredAt: this.now().toISOString(), correlationId: correlationId ?? id });
    const recipients = recipientsFor(event, (producer) => this.graph.dependentsOf(producer));
    this.ledger.append("coordination.event", { ...(from === WEAVE_SENDER ? {} : { taskId: from }), event, recipients: [...recipients] });
    for (const recipient of recipients) this.mailboxes.deliver(recipient, event);
    return event;
  }

  private notifyChange(): void {
    const current = this.wake;
    this.wake = Coordinator.waiter();
    current.resolve();
  }
}
