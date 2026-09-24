import type { Ledger } from "../../shared/index.ts";
import { taskKindOf } from "../estimate/index.ts";
import type { Spend } from "../history/index.ts";
import { exceededLimit, limitsFor } from "./limits.ts";
import { SpendTracker } from "./spend-tracker.ts";
import { NO_SPEND, type Admission, type BudgetActions, type Budgets, type Exceeded, type ScopeKey } from "./types.ts";

export interface BudgetTask {
  readonly id: string;
  readonly prompt: string;
  readonly allowedPaths?: readonly string[];
  readonly component?: string;
}

export interface BudgetManagerOptions {
  readonly budgets: Budgets;
  readonly ledger: Ledger;
  readonly tasks: readonly BudgetTask[];
  readonly projectSpend?: Spend;
  readonly now?: () => number;
}

const NO_ACTIONS: BudgetActions = { stopTask: () => undefined, stopRun: () => undefined };

function describe(scope: ScopeKey, exceeded: Exceeded): string {
  return `${scope.scope} budget ${scope.key} exceeded: ${exceeded.dimension} ${exceeded.spent} of ${exceeded.limit}`;
}

export class BudgetManager {
  private readonly budgets: Budgets;
  private readonly ledger: Ledger;
  private readonly now: () => number;
  private readonly tracker: SpendTracker;
  private readonly reported = new Set<string>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private actions: BudgetActions = NO_ACTIONS;

  constructor(options: BudgetManagerOptions) {
    this.budgets = options.budgets;
    this.ledger = options.ledger;
    this.now = options.now ?? Date.now;
    const kinds = new Map(options.tasks.map((task) => [task.id, taskKindOf(task)]));
    this.tracker = new SpendTracker({ kinds, runStartedAtMs: this.now(), projectBase: options.projectSpend ?? NO_SPEND });
  }

  bind(actions: BudgetActions): void {
    this.actions = actions;
    this.after(this.budgets.run?.maxWallMs, () => this.check([{ scope: "run", key: "run" }]));
  }

  watch(ledger: Ledger): () => void {
    return ledger.subscribe((event) => {
      if (event.type === "budget.exceeded") return;
      const taskId = this.tracker.apply(event, this.now());
      if (taskId) this.check(this.scopesFor(taskId));
    });
  }

  admits(taskId: string): Admission {
    const kind = this.tracker.kindOf(taskId);
    const scopes: ScopeKey[] = [{ scope: "project", key: "project" }, { scope: "run", key: "run" }, ...(kind ? [{ scope: "employee" as const, key: kind }] : [])];
    for (const scope of scopes) {
      const exceeded = exceededLimit(this.tracker.spendOf(scope, this.now()), limitsFor(this.budgets, scope));
      if (!exceeded) continue;
      this.ledger.append("budget.exceeded", { taskId, scope: scope.scope, key: scope.key, ...exceeded, action: "skip-task" });
      return { ok: false, reason: describe(scope, exceeded) };
    }
    return { ok: true };
  }

  taskStarted(taskId: string): void {
    this.tracker.taskStarted(taskId, this.now());
    this.after(this.budgets.task?.maxWallMs, () => this.check([{ scope: "task", key: taskId }]));
  }

  taskSettled(taskId: string): void {
    this.tracker.taskSettled(taskId, this.now());
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private after(delayMs: number | undefined, run: () => void): void {
    if (delayMs === undefined) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, delayMs);
    this.timers.add(timer);
  }

  private scopesFor(taskId: string): readonly ScopeKey[] {
    const kind = this.tracker.kindOf(taskId);
    const engineId = this.tracker.openEngineOf(taskId);
    return [
      { scope: "task", key: taskId },
      ...(kind ? [{ scope: "employee" as const, key: kind }] : []),
      ...(engineId ? [{ scope: "engine" as const, key: engineId }] : []),
      { scope: "run", key: "run" },
      { scope: "project", key: "project" },
    ];
  }

  private check(scopes: readonly ScopeKey[]): void {
    for (const scope of scopes) {
      const reportKey = `${scope.scope}:${scope.key}`;
      if (this.reported.has(reportKey)) continue;
      const exceeded = exceededLimit(this.tracker.spendOf(scope, this.now()), limitsFor(this.budgets, scope));
      if (!exceeded) continue;
      this.reported.add(reportKey);
      this.enforce(scope, exceeded);
    }
  }

  private enforce(scope: ScopeKey, exceeded: Exceeded): void {
    const reason = describe(scope, exceeded);
    const isRunWide = scope.scope === "run" || scope.scope === "project";
    this.ledger.append("budget.exceeded", { ...(scope.scope === "task" ? { taskId: scope.key } : {}), scope: scope.scope, key: scope.key, ...exceeded, action: isRunWide ? "stop-run" : "stop-task" });
    if (isRunWide) {
      this.actions.stopRun(reason);
      return;
    }
    for (const taskId of this.tasksIn(scope)) this.actions.stopTask(taskId, reason);
  }

  private tasksIn(scope: ScopeKey): readonly string[] {
    const running = this.tracker.runningTaskIds();
    if (scope.scope === "task") return running.filter((taskId) => taskId === scope.key);
    if (scope.scope === "employee") return running.filter((taskId) => this.tracker.kindOf(taskId) === scope.key);
    return running.filter((taskId) => this.tracker.openEngineOf(taskId) === scope.key);
  }
}
