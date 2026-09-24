import type { HistoryRead } from "../adaptive/index.ts";
import { employeeInspector, engineOrderFor, loadEmployeeRegistry, prepareEmployees, recordEmployeeMemories, renderRoster, type EmployeeRegistry, type PreparedEmployees } from "../employees/index.ts";
import type { PlannedTask } from "../planner/index.ts";
import type { InspectHarvest, PoolReport } from "../pool/index.ts";
import type { Ledger } from "../shared/index.ts";
import { buildSkillRegistry } from "../skills/index.ts";
import type { EmployeesOptions } from "./types.ts";

export interface EmployeeContext {
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
}

export async function loadRoster(options: EmployeesOptions, context: EmployeeContext): Promise<{ readonly registry: EmployeeRegistry; readonly roster: string }> {
  const registry = options.registry ?? await loadEmployeeRegistry({ projectRoot: context.repoRoot, userDir: options.userDir ?? null });
  for (const skipped of registry.skipped) context.ledger.append("error", { where: "employees.registry", message: `${skipped.sourcePath}: ${skipped.reason}` });
  return { registry, roster: renderRoster(registry.employees) };
}

export interface EmployeeSetupInput extends EmployeeContext {
  readonly registry: EmployeeRegistry;
  readonly tasks: readonly PlannedTask[];
  readonly configuredEngines: readonly string[];
  readonly history: () => Promise<HistoryRead>;
}

export async function employeeSetup(input: EmployeeSetupInput): Promise<PreparedEmployees<PlannedTask>> {
  const history = await input.history();
  return prepareEmployees({
    tasks: input.tasks, registry: input.registry, ledger: input.ledger, weaveDir: input.weaveDir,
    configuredEngines: input.configuredEngines, history: history.runs, skills: buildSkillRegistry([]),
  });
}

export function employeeRoutes(prepared: PreparedEmployees<PlannedTask>, routeOf: (taskId: string) => readonly string[]): ReadonlyMap<string, readonly string[]> {
  return new Map(prepared.tasks.map((task) => {
    const employee = prepared.employeesByTask.get(task.id);
    const order = routeOf(task.id);
    return [task.id, employee ? engineOrderFor(employee, order) : order];
  }));
}

export function withEmployeeVerification(prepared: PreparedEmployees<PlannedTask>, ledger: Ledger, next: InspectHarvest | undefined): InspectHarvest {
  return employeeInspector({ employeesByTask: prepared.employeesByTask, ledger, ...(next ? { next } : {}) });
}

export function rememberRun(prepared: PreparedEmployees<PlannedTask>, report: PoolReport, context: EmployeeContext): Promise<void> {
  return recordEmployeeMemories({
    report, titles: new Map(prepared.tasks.map((task) => [task.id, task.title])), employeesByTask: prepared.employeesByTask,
    weaveDir: context.weaveDir, ledger: context.ledger, now: new Date(),
  });
}
