import type { WeaveEvent } from "@weave/protocol";
import type { Ledger } from "../shared/index.ts";
import type { ScheduledState } from "../scheduler/index.ts";
import { outputKey, taskPhases } from "./phases.ts";
import type { DagTask, TaskPhase, TaskPhaseView } from "./types.ts";

const ARTIFACT_EVENTS: ReadonlySet<string> = new Set([
  "artifact.ready",
  "artifact.updated",
  "contract.published",
  "contract.changed",
]);

export interface PhaseTrackerInput {
  readonly tasks: readonly DagTask[];
  readonly onChange?: (phases: readonly TaskPhaseView[]) => void;
}

export class PhaseTracker {
  private readonly tasks: readonly DagTask[];
  private readonly states = new Map<string, ScheduledState>();
  private readonly readyOutputs = new Set<string>();
  private readonly verifying = new Set<string>();
  private readonly onChange: ((phases: readonly TaskPhaseView[]) => void) | undefined;
  private last = "";

  constructor(input: PhaseTrackerInput) {
    this.tasks = input.tasks;
    this.onChange = input.onChange;
  }

  phases(): readonly TaskPhaseView[] {
    return taskPhases({
      tasks: this.tasks,
      states: this.states,
      readyOutputs: this.readyOutputs,
      verifying: this.verifying,
    });
  }

  phaseOf(taskId: string): TaskPhase | null {
    return this.phases().find((view) => view.taskId === taskId)?.phase ?? null;
  }

  apply(event: WeaveEvent): void {
    if (event.type === "coordination.event") this.applyCoordination(event.event);
    if (event.type === "pool.task.settled") this.states.set(event.taskId, event.status);
    if (event.type === "task.skipped") this.states.set(event.taskId, "skipped");
    this.publish();
  }

  watch(ledger: Ledger): () => void {
    return ledger.subscribe((event) => this.apply(event));
  }

  private applyCoordination(event: Extract<WeaveEvent, { type: "coordination.event" }>["event"]): void {
    if (event.type === "task.started") this.states.set(event.from, "running");
    if (!ARTIFACT_EVENTS.has(event.type) || !("artifact" in event.data)) return;
    const { name, provides } = event.data.artifact;
    for (const output of [name, ...provides]) this.readyOutputs.add(outputKey(event.from, output));
  }

  private publish(): void {
    if (!this.onChange) return;
    const phases = this.phases();
    const shape = phases.map((view) => `${view.taskId}:${view.phase}`).join("|");
    if (shape === this.last) return;
    this.last = shape;
    this.onChange(phases);
  }
}
