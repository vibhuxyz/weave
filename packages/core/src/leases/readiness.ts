import { topologicalOrder, type SchedulableTask } from "../scheduler/index.ts";

class Fifo {
  private readonly items: string[] = [];
  private head = 0;

  push(item: string): void {
    this.items.push(item);
  }

  shift(): string | undefined {
    const item = this.items[this.head];
    if (item !== undefined) this.head += 1;
    return item;
  }
}

const MAX_LISTED_PROBLEMS = 10;

function gatesStart(dependency: { readonly requiredOutputs: readonly string[] }): boolean {
  return dependency.requiredOutputs.length === 0;
}

function planProblem(tasks: readonly SchedulableTask[]): string | null {
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) return "task ids must be unique";
  const unknown = tasks.flatMap((task) => (task.dependencies ?? []).filter((dependency) => !ids.has(dependency.task)).map((dependency) => `${task.id} → ${dependency.task}`));
  if (unknown.length > 0) return `unknown dependencies: ${unknown.slice(0, MAX_LISTED_PROBLEMS).join(", ")}`;
  return topologicalOrder(tasks).length === tasks.length ? null : "the dependencies form a cycle";
}

export class Readiness {
  private readonly waitingOn = new Map<string, Set<string>>();
  private readonly dependents = new Map<string, string[]>();
  private readonly dependencies = new Map<string, readonly string[]>();
  private readonly fresh = new Fifo();
  private readonly retries = new Fifo();

  constructor(tasks: readonly SchedulableTask[]) {
    const problem = planProblem(tasks);
    if (problem !== null) throw new Error(`A lease table needs a runnable plan: ${problem}`);
    for (const task of tasks) {
      const dependencies = task.dependencies ?? [];
      this.dependencies.set(task.id, dependencies.map((dependency) => dependency.task));
      this.waitingOn.set(task.id, new Set(dependencies.filter(gatesStart).map((dependency) => dependency.task)));
      for (const dependency of dependencies) this.addDependent(dependency.task, task.id);
      if (this.waitingOn.get(task.id)?.size === 0) this.fresh.push(task.id);
    }
  }

  private addDependent(producer: string, dependent: string): void {
    const known = this.dependents.get(producer);
    if (known) known.push(dependent);
    else this.dependents.set(producer, [dependent]);
  }

  next(isQueued: (taskId: string) => boolean): string | null {
    for (let taskId = this.retries.shift() ?? this.fresh.shift(); taskId !== undefined; taskId = this.retries.shift() ?? this.fresh.shift()) {
      if (isQueued(taskId)) return taskId;
    }
    return null;
  }

  retry(taskId: string): void {
    this.retries.push(taskId);
  }

  verified(taskId: string): void {
    for (const dependent of this.dependentsOf(taskId)) {
      const waiting = this.waitingOn.get(dependent);
      if (waiting?.delete(taskId) && waiting.size === 0) this.fresh.push(dependent);
    }
  }

  dependentsOf(taskId: string): readonly string[] {
    return this.dependents.get(taskId) ?? [];
  }

  dependenciesOf(taskId: string): readonly string[] {
    return this.dependencies.get(taskId) ?? [];
  }
}
