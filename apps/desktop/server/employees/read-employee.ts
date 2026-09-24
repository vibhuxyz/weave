import { readMemory } from "@weave/core";
import type { EmployeeDetail } from "../shared/index.ts";
import { MAX_MEMORY_SHOWN } from "./constants.ts";
import { briefOf } from "./employee-brief.ts";
import { loadRegistry, weaveDirOf } from "./load-employees.ts";

export type EmployeeDetailRead = { readonly ok: true; readonly detail: EmployeeDetail } | { readonly ok: false; readonly message: string };

export async function readEmployee(projectDir: string, id: string): Promise<EmployeeDetailRead> {
  const employee = (await loadRegistry(projectDir)).byId.get(id);
  if (!employee) return { ok: false, message: `Cannot read employee ${id}: no employee has that id in this project.` };
  const memory = await readMemory(weaveDirOf(projectDir), employee.id);
  return {
    ok: true,
    detail: {
      id,
      brief: briefOf(employee),
      memory: memory.entries.slice(-MAX_MEMORY_SHOWN).reverse(),
      memoryTotal: memory.entries.length,
      memoryIssue: memory.issue,
    },
  };
}
