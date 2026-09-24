import type { TaskContract, TaskDependency } from "@weave/protocol";
import { validateGraph } from "../../planner/index.ts";
import type { AddDependencyResult, DependencyEdge, Dependent } from "./types.ts";

type GraphTask = Pick<TaskContract, "id" | "dependencies">;

function mergeDependency(existing: TaskDependency | undefined, output: string): TaskDependency | null {
  if (!existing) return null;
  if (existing.requiredOutputs.length === 0 || existing.requiredOutputs.includes(output)) return existing;
  return { task: existing.task, requiredOutputs: [...existing.requiredOutputs, output] };
}

function withDependency(task: GraphTask, producer: string, output: string): GraphTask {
  const dependencies = task.dependencies ?? [];
  const current = dependencies.find((dependency) => dependency.task === producer);
  const merged = mergeDependency(current, output) ?? { task: producer, requiredOutputs: [output] };
  const others = dependencies.filter((dependency) => dependency.task !== producer);
  return { ...task, dependencies: [...others, merged] };
}

export class DependencyGraph<T extends GraphTask> {
  private tasks: readonly T[];
  private readonly edges: DependencyEdge[] = [];

  constructor(tasks: readonly T[]) {
    this.tasks = tasks;
  }

  current(): readonly T[] {
    return this.tasks;
  }

  added(): readonly DependencyEdge[] {
    return this.edges;
  }

  has(taskId: string): boolean {
    return this.tasks.some((task) => task.id === taskId);
  }

  add(consumer: string, producer: string, output: string): AddDependencyResult {
    if (consumer === producer) return { ok: false, reason: `Task ${consumer} cannot depend on itself` };
    const target = this.tasks.find((task) => task.id === consumer);
    if (!target || !this.has(producer)) return { ok: false, reason: `Unknown task in dependency ${consumer} -> ${producer}` };
    const updated = withDependency(target, producer, output);
    const next = this.tasks.map((task) => (task.id === consumer ? { ...task, dependencies: updated.dependencies } : task));
    const issues = validateGraph(next);
    if (issues.length > 0) return { ok: false, reason: issues.join("; ") };
    const isNew = JSON.stringify(updated.dependencies) !== JSON.stringify(target.dependencies ?? []);
    this.tasks = next;
    if (isNew) this.edges.push({ taskId: consumer, dependency: { task: producer, requiredOutputs: [output] } });
    return { ok: true, isNew };
  }

  dependentsOf(producer: string): readonly Dependent[] {
    return this.tasks.flatMap((task) =>
      (task.dependencies ?? [])
        .filter((dependency) => dependency.task === producer)
        .map((dependency) => ({ consumer: task.id, requiredOutputs: dependency.requiredOutputs })),
    );
  }
}
