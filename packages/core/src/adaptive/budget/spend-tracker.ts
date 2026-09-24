import type { WeaveEvent } from "@weave/protocol";
import { usdToMicro } from "../../shared/index.ts";
import type { Spend } from "../history/index.ts";
import { addSpend } from "./limits.ts";
import { NO_SPEND, type ScopeKey } from "./types.ts";

interface OpenAttempt {
  readonly engineId: string;
  readonly costMicroUsd: bigint;
  readonly tokens: number;
  readonly startedAtMs: number;
}

interface TaskSpend {
  readonly committed: Spend;
  readonly open: OpenAttempt | null;
  readonly startedAtMs: number | null;
  readonly settledAtMs: number | null;
}

const EMPTY_TASK: TaskSpend = { committed: NO_SPEND, open: null, startedAtMs: null, settledAtMs: null };

export class SpendTracker {
  private readonly tasks = new Map<string, TaskSpend>();
  private readonly engines = new Map<string, Spend>();
  private readonly kinds: ReadonlyMap<string, string>;
  private readonly runStartedAtMs: number;
  private readonly projectBase: Spend;

  constructor(options: { readonly kinds: ReadonlyMap<string, string>; readonly runStartedAtMs: number; readonly projectBase: Spend }) {
    this.kinds = options.kinds;
    this.runStartedAtMs = options.runStartedAtMs;
    this.projectBase = options.projectBase;
  }

  kindOf(taskId: string): string | undefined {
    return this.kinds.get(taskId);
  }

  openEngineOf(taskId: string): string | null {
    return this.tasks.get(taskId)?.open?.engineId ?? null;
  }

  runningTaskIds(): readonly string[] {
    return [...this.tasks.entries()].filter(([, spend]) => spend.startedAtMs !== null && spend.settledAtMs === null).map(([taskId]) => taskId).sort();
  }

  taskStarted(taskId: string, nowMs: number): void {
    this.tasks.set(taskId, { ...this.taskOf(taskId), startedAtMs: nowMs, settledAtMs: null });
  }

  taskSettled(taskId: string, nowMs: number): void {
    this.tasks.set(taskId, { ...this.taskOf(taskId), settledAtMs: nowMs });
  }

  apply(event: WeaveEvent, nowMs: number): string | null {
    const taskId = event.taskId;
    if (!taskId) return null;
    const task = this.taskOf(taskId);
    if (event.type === "attempt.started") {
      this.tasks.set(taskId, { ...this.commit(task, 0), open: { engineId: event.engineId, costMicroUsd: 0n, tokens: 0, startedAtMs: nowMs } });
      return taskId;
    }
    if (event.type === "usage" && task.open) {
      const cost = usdToMicro(event.costUsd ?? 0);
      const open = { ...task.open, costMicroUsd: cost > task.open.costMicroUsd ? cost : task.open.costMicroUsd, tokens: Math.max(task.open.tokens, event.used) };
      this.tasks.set(taskId, { ...task, open });
      return taskId;
    }
    if (event.type === "task.finished" && task.open) {
      this.tasks.set(taskId, this.commit(task, event.wallMs));
      return taskId;
    }
    return null;
  }

  spendOf(scope: ScopeKey, nowMs: number): Spend {
    switch (scope.scope) {
      case "task":
        return this.taskSpend(scope.key, nowMs);
      case "employee":
        return this.sumTasks([...this.tasks.keys()].filter((taskId) => this.kinds.get(taskId) === scope.key), nowMs);
      case "engine":
        return this.engineSpend(scope.key, nowMs);
      case "run":
        return { ...this.sumTasks([...this.tasks.keys()], nowMs), wallMs: nowMs - this.runStartedAtMs };
      case "project":
        return addSpend(this.projectBase, { ...this.sumTasks([...this.tasks.keys()], nowMs), wallMs: nowMs - this.runStartedAtMs });
      default: {
        const unhandled: never = scope.scope;
        return unhandled;
      }
    }
  }

  private taskOf(taskId: string): TaskSpend {
    return this.tasks.get(taskId) ?? EMPTY_TASK;
  }

  private commit(task: TaskSpend, attemptWallMs: number): TaskSpend {
    if (!task.open) return task;
    const spent: Spend = { costMicroUsd: task.open.costMicroUsd, tokens: task.open.tokens, wallMs: 0 };
    this.engines.set(task.open.engineId, addSpend(this.engines.get(task.open.engineId) ?? NO_SPEND, { ...spent, wallMs: attemptWallMs }));
    return { ...task, committed: addSpend(task.committed, spent), open: null };
  }

  private taskSpend(taskId: string, nowMs: number): Spend {
    const task = this.taskOf(taskId);
    const open: Spend = task.open ? { costMicroUsd: task.open.costMicroUsd, tokens: task.open.tokens, wallMs: 0 } : NO_SPEND;
    const wallMs = task.startedAtMs === null ? 0 : (task.settledAtMs ?? nowMs) - task.startedAtMs;
    return { ...addSpend(task.committed, open), wallMs };
  }

  private sumTasks(taskIds: readonly string[], nowMs: number): Spend {
    return taskIds.reduce((total, taskId) => addSpend(total, this.taskSpend(taskId, nowMs)), NO_SPEND);
  }

  private engineSpend(engineId: string, nowMs: number): Spend {
    const running = [...this.tasks.values()].flatMap((task) => (task.open?.engineId === engineId ? [task.open] : []));
    return running.reduce<Spend>(
      (total, open) => addSpend(total, { costMicroUsd: open.costMicroUsd, tokens: open.tokens, wallMs: nowMs - open.startedAtMs }),
      this.engines.get(engineId) ?? NO_SPEND,
    );
  }
}
