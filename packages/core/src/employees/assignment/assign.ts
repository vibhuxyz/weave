import type { TaskContract } from "@weave/protocol";
import type { Ledger } from "../../shared/index.ts";
import type { Employee } from "../model/index.ts";
import type { EmployeeRegistry } from "../registry/index.ts";
import { resolveEmployee, type AssignableTask, type Resolution, type ResolveOptions } from "../resolver/index.ts";
import { compileTask } from "./compile-task.ts";

export interface Assignment {
  readonly taskId: string;
  readonly employee: Employee | null;
  readonly resolution: Resolution;
}

export interface AssignedPlan<T> {
  readonly tasks: readonly T[];
  readonly assignments: readonly Assignment[];
}

export function assignEmployees<T extends TaskContract & AssignableTask>(tasks: readonly T[], registry: EmployeeRegistry, options: ResolveOptions): AssignedPlan<T> {
  const assignments = tasks.map((task) => {
    const resolution = resolveEmployee(task, registry, options);
    return { taskId: task.id, employee: resolution.chosen?.employee ?? null, resolution };
  });
  const byTask = new Map(assignments.map((assignment) => [assignment.taskId, assignment.employee]));
  return {
    tasks: tasks.map((task) => {
      const employee = byTask.get(task.id);
      return employee ? compileTask(task, employee) : task;
    }),
    assignments,
  };
}

export function logAssignments(ledger: Ledger, assignments: readonly Assignment[]): void {
  for (const { taskId, resolution } of assignments) {
    ledger.append("employee.assigned", {
      taskId,
      employeeId: resolution.chosen?.employee.id ?? null,
      score: Math.round((resolution.chosen?.score ?? 0) * 10) / 10,
      reasons: [resolution.reason],
    });
  }
}
