import type { TaskContract } from "@weave/protocol";
import type { RunHistory } from "../../adaptive/index.ts";
import type { Ledger } from "../../shared/index.ts";
import type { SkillRegistry } from "../../skills/index.ts";
import { assignEmployees, logAssignments, type Assignment } from "../assignment/index.ts";
import { readMemory, recallMemories, renderMemories, type MemoryEntry } from "../memory/index.ts";
import type { Employee } from "../model/index.ts";
import { employeePerformance } from "../performance/index.ts";
import { renderEmployeeBrief, type SkillHint } from "../prompt/index.ts";
import type { EmployeeRegistry } from "../registry/index.ts";
import type { AssignableTask } from "../resolver/index.ts";

export interface PrepareEmployeesInput<T> {
  readonly tasks: readonly T[];
  readonly registry: EmployeeRegistry;
  readonly ledger: Ledger;
  readonly weaveDir: string;
  readonly configuredEngines: readonly string[];
  readonly history?: readonly RunHistory[];
  readonly skills?: SkillRegistry;
}

export interface PreparedEmployees<T> {
  readonly tasks: readonly T[];
  readonly assignments: readonly Assignment[];
  readonly employeesByTask: ReadonlyMap<string, Employee>;
  readonly briefings: ReadonlyMap<string, string>;
}

function skillHints(employee: Employee, skills: SkillRegistry | undefined): readonly SkillHint[] {
  const byName = new Map((skills?.skills ?? []).map((skill) => [skill.name, skill.description]));
  return employee.skills.map((name) => ({ name, description: byName.get(name) ?? "" }));
}

async function memoriesByEmployee(employees: readonly Employee[], weaveDir: string, ledger: Ledger): Promise<ReadonlyMap<string, readonly MemoryEntry[]>> {
  const remembering = employees.filter((employee) => employee.memory.enabled);
  const reads = await Promise.all(remembering.map(async (employee) => [employee.id, await readMemory(weaveDir, employee.id)] as const));
  for (const [employeeId, read] of reads) {
    if (read.issue) ledger.append("error", { where: "employees.memory", message: `${employeeId}: ${read.issue}` });
  }
  return new Map(reads.map(([employeeId, read]) => [employeeId, read.entries]));
}

export async function prepareEmployees<T extends TaskContract & AssignableTask>(input: PrepareEmployeesInput<T>): Promise<PreparedEmployees<T>> {
  const performance = employeePerformance(input.history ?? []);
  const assigned = assignEmployees(input.tasks, input.registry, { configuredEngines: input.configuredEngines, performance });
  logAssignments(input.ledger, assigned.assignments);
  const employeesByTask = new Map(assigned.assignments.flatMap((assignment) => (assignment.employee ? [[assignment.taskId, assignment.employee] as const] : [])));
  const distinct = [...new Map([...employeesByTask.values()].map((employee) => [employee.id, employee])).values()];
  const memories = await memoriesByEmployee(distinct, input.weaveDir, input.ledger);
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const briefings = new Map([...employeesByTask.entries()].map(([taskId, employee]) => {
    const task = tasksById.get(taskId);
    const recalled = recallMemories(memories.get(employee.id) ?? [], `${task?.title ?? ""} ${task?.prompt ?? ""}`, employee.memory.recallCount);
    const memory = renderMemories(employee.id, recalled);
    return [taskId, [renderEmployeeBrief(employee, skillHints(employee, input.skills)), ...(memory ? [memory] : [])].join("\n\n")];
  }));
  return { tasks: assigned.tasks, assignments: assigned.assignments, employeesByTask, briefings };
}
