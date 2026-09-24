import { renderEmployeeBrief, type Employee, type EmployeePerformance, type MemoryEntry } from "@weave/core";
import type { EmployeeView } from "../shared/index.ts";
import { RECENT_MEMORIES } from "./constants.ts";

export interface EmployeeExtras {
  readonly memory: readonly MemoryEntry[];
  readonly performance: EmployeePerformance | undefined;
}

export function toEmployeeView(employee: Employee, extras: EmployeeExtras): EmployeeView {
  const { permissions } = employee;
  return {
    id: employee.id,
    name: employee.name,
    description: employee.description,
    source: employee.source,
    sourcePath: employee.sourcePath,
    responsibilities: employee.responsibilities,
    skills: employee.skills,
    rules: employee.rules,
    instructions: employee.instructions,
    permissions: {
      read: permissions.filesystem.read,
      write: permissions.filesystem.write,
      deployment: permissions.deployment.allowed,
      network: permissions.network.allowed,
      gitCommit: permissions.git.commit,
    },
    capabilities: employee.capabilities,
    engines: employee.engines,
    verification: employee.verification,
    memory: {
      enabled: employee.memory.enabled,
      entries: extras.memory.length,
      recent: extras.memory.slice(-RECENT_MEMORIES).reverse().map(({ kind, taskId, at, text }) => ({ kind, taskId, at, text })),
    },
    performance: extras.performance ? { tasks: extras.performance.tasks, ok: extras.performance.ok } : null,
    brief: renderEmployeeBrief(employee, employee.skills.map((name) => ({ name, description: "" }))),
  };
}
